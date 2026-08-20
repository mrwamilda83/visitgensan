import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("contact page contains accessible labeled fields and centralized Turnstile configuration", async () => {
  const html = await read("contact.html");
  const contactScript = await read("assets/js/contact.js");

  for (const id of ["contact-name", "contact-email", "contact-subject", "contact-message"]) {
    assert.match(html, new RegExp(`<label[^>]+for="${id}"`, "u"));
    assert.match(html, new RegExp(`id="${id}"`, "u"));
  }
  assert.match(html, /aria-live="polite"/u);
  assert.match(html, /id="contact-turnstile-widget"/u);
  assert.equal((contactScript.match(/0x4AAAAAAEOpSGmncMtxmSyJ/gu) || []).length, 1);
  assert.equal((contactScript.match(/1x00000000000000000000AA/gu) || []).length, 1);
});

test("all ordinary footer Contact Us links use contact.html", async () => {
  const htmlFiles = (await readdir(root)).filter((file) => file.endsWith(".html"));
  let footerCount = 0;

  for (const file of htmlFiles) {
    const html = await read(file);
    if (!html.includes("<footer")) continue;
    footerCount += 1;
    assert.match(html, /<a href="contact\.html"(?: aria-current="page")?>Contact Us<\/a>/u, file);
  }

  assert.equal(footerCount, 19);
});

test("VisitGenSan owner recipient addresses are absent while external business addresses remain", async () => {
  const trackedTextFiles = [
    ...(await readdir(root)).filter((file) => /\.(?:html|md|json|xml|toml)$/u.test(file)),
    "assets/js/main.js",
    "assets/js/contact.js",
    "data/search-pages.json"
  ];
  const combined = (await Promise.all(trackedTextFiles.map(read))).join("\n");

  assert.doesNotMatch(combined, /mrwamilda83@gmail\.com|revarkz@gmail\.com/iu);
  assert.match(combined, /gensancitytaxi@gmail\.com/iu);
});

test("public files contain no Apps Script URL, shared secret value, Turnstile secret, or rate-limit pepper", async () => {
  const publicFiles = [
    "contact.html",
    "assets/js/contact.js",
    "assets/js/contact-validation.js",
    "data/search-pages.json"
  ];
  const combined = (await Promise.all(publicFiles.map(read))).join("\n");

  assert.doesNotMatch(combined, /script\.google\.com\/macros|CONTACT_SHARED_SECRET|TURNSTILE_SECRET_KEY|CONTACT_RATE_LIMIT_PEPPER/iu);
});

test("sitemap and search metadata contain exactly one Contact Us entry", async () => {
  const sitemap = await read("sitemap.xml");
  const searchPages = JSON.parse(await read("data/search-pages.json"));

  assert.equal((sitemap.match(/https:\/\/visitgensan\.com\/contact\.html/gu) || []).length, 1);
  assert.equal(searchPages.filter((entry) => entry.url === "contact.html").length, 1);
  assert.equal(new Set(searchPages.map((entry) => entry.id)).size, searchPages.length);
});

test("privacy policy keeps its date and discloses the implemented contact data flow", async () => {
  const privacy = await read("privacy.html");

  assert.match(privacy, /Last Updated: August 13, 2026/u);
  assert.match(privacy, /name, email address, subject, and message/u);
  assert.match(privacy, /Google Apps Script/u);
  assert.match(privacy, /does not store contact names/u);
  assert.match(privacy, /expire within no more than 24 hours/u);
  assert.match(privacy, /href="contact\.html">Contact Us page/u);
});
