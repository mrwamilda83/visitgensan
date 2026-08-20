import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDirectory, "..");

function read(relativePath) {
  return readFile(resolve(projectRoot, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse((await read(relativePath)).replace(/^\uFEFF/, ""));
}

async function createSearchHarness() {
  const script = await read("assets/js/search.js");
  const location = {
    href: "https://visitgensan.com/search.html",
    origin: "https://visitgensan.com",
    search: "",
    assign() {}
  };
  const context = vm.createContext({
    console,
    fetch: async (dataUrl) => ({
      ok: true,
      json: async () => readJson(String(dataUrl))
    }),
    document: {
      querySelectorAll: () => [],
      querySelector: () => null
    },
    window: { location },
    URL,
    URLSearchParams
  });

  vm.runInContext(script, context, { filename: "assets/js/search.js" });
  return context.window.VisitGenSanSearch;
}

function published(record, searchApi) {
  return searchApi.isPublishedRecord(record);
}

function resultTitles(searchApi, records, query) {
  return searchApi.searchRecords(records, query).map(({ record }) => record.title);
}

test("site search indexes every published data record by name", async () => {
  const searchApi = await createSearchHarness();
  const { records, failedSources } = await searchApi.loadSearchIndex();
  assert.equal(failedSources, 0);

  const sourceFiles = [
    "data/hotels.json",
    "data/restaurants.json",
    "data/activities.json",
    "data/guides.json",
    "data/search-pages.json"
  ];

  for (const sourceFile of sourceFiles) {
    const sourceRecords = await readJson(sourceFile);
    for (const sourceRecord of sourceRecords.filter((record) => published(record, searchApi))) {
      const matches = resultTitles(searchApi, records, sourceRecord.title);
      assert.ok(
        matches.some((title) => searchApi.normalizeText(title) === searchApi.normalizeText(sourceRecord.title)),
        `${sourceRecord.title} from ${sourceFile} should be searchable by name`
      );
    }
  }
});

test("J-Hills is searchable by its useful name and activity aliases", async () => {
  const searchApi = await createSearchHarness();
  const { records } = await searchApi.loadSearchIndex();
  const expectedTitle = "J-Hills Golf Range and Restaurant";
  const queries = [
    "J Hills Golf Range and Restaurant",
    "J Hills",
    "jhills",
    "j hills",
    "golf range",
    "driving range"
  ];

  for (const query of queries) {
    assert.ok(
      resultTitles(searchApi, records, query).includes(expectedTitle),
      `Expected J-Hills result for query: ${query}`
    );
  }
});

test("site search keeps representative sections working and excludes coming-soon records", async () => {
  const searchApi = await createSearchHarness();
  const { records } = await searchApi.loadSearchIndex();

  const representativeQueries = new Map([
    ["Greenleaf Hotel Gensan", "Greenleaf Hotel Gensan"],
    ["White House Cafe", "The White House Cafè Gensan"],
    ["Fish Port Complex", "Fish Port Complex"],
    ["Getting Around GenSan", "Getting Around GenSan"]
  ]);

  for (const [query, expectedTitle] of representativeQueries) {
    assert.ok(resultTitles(searchApi, records, query).includes(expectedTitle));
  }

  const indexedTitles = records.map((record) => record.title);
  assert.ok(!indexedTitles.includes("Queen Tuna Park"));
  assert.ok(!indexedTitles.includes("GenSan Airport to City Guide"));
});

test("every sitemap page is represented by an existing search data source", async () => {
  const sitemap = await read("sitemap.xml");
  const searchApi = await createSearchHarness();
  const sourceFiles = [
    "data/activities.json",
    "data/restaurants.json",
    "data/guides.json",
    "data/search-pages.json"
  ];
  const indexedPaths = new Set();

  for (const sourceFile of sourceFiles) {
    const sourceRecords = await readJson(sourceFile);
    sourceRecords
      .filter((record) => published(record, searchApi))
      .map((record) => String(record.url || "").trim())
      .filter((url) => url && url !== "#")
      .forEach((url) => indexedPaths.add(new URL(url, "https://visitgensan.com/").pathname));
  }

  const sitemapPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => new URL(match[1]).pathname);
  const missingPaths = sitemapPaths.filter((pathname) => !indexedPaths.has(pathname));

  assert.deepEqual(missingPaths, []);
});
