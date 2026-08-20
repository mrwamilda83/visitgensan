import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { onRequest as handleReactions } from "../functions/api/reactions.js";

const eligiblePages = Object.freeze({
  "the-white-house-cafe-gensan.html": "place:the-white-house-cafe-gensan",
  "american-backyard-gensan.html": "place:american-backyard-gensan",
  "cotton-bowl-grill-steak-house.html": "place:cotton-bowl-grill-steak-house",
  "don-carmelos-smokin-area.html": "place:don-carmelos-smokin-area",
  "sam-and-dean.html": "place:sam-and-dean",
  "fish-port-complex.html": "place:fish-port-complex",
  "plaza-heneral-santos.html": "place:plaza-heneral-santos",
  "sarangani-highlands-garden.html": "place:sarangani-highlands-garden",
  "j-hills-golf-range-and-restaurant.html": "place:j-hills-golf-range-and-restaurant"
});

const restaurantPages = Object.keys(eligiblePages).slice(0, 5);
const thingsPages = Object.keys(eligiblePages).slice(5);
const excludedPages = [
  "index.html",
  "food-restaurants.html",
  "things-to-do.html",
  "travel-guides.html",
  "getting-around-gensan.html",
  "search.html",
  "contact.html",
  "privacy.html",
  "get-featured.html",
  "listing-policy.html"
];

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("every eligible published place has one unique place reaction key and keeps guide feedback", async () => {
  const seenKeys = new Set();

  for (const [page, key] of Object.entries(eligiblePages)) {
    const html = await read(page);
    const matches = html.match(/data-place-reactions/gu) || [];

    assert.equal(matches.length, 1, `${page} should contain one place reaction control`);
    assert.match(html, new RegExp(`data-reaction-key="${key}"`, "u"));
    assert.match(html, /data-guide-reactions/u, `${page} should retain its guide feedback control`);
    assert.equal(seenKeys.has(key), false, `${key} should be unique`);
    seenKeys.add(key);
  }
});

test("restaurant hearts appear after identity metadata and directly before the main description", async () => {
  for (const page of restaurantPages) {
    const html = await read(page);
    const title = html.indexOf('<header class="restaurant-title-block">');
    const metadata = html.indexOf('<div class="restaurant-meta-row"');
    const descriptionPanel = html.indexOf('<article class="restaurant-description-panel">');
    const heart = html.indexOf("data-place-reactions");
    const description = html.indexOf("<p>", heart);
    const gallery = html.indexOf('<section class="restaurant-gallery-mosaic"');

    assert.ok(title < metadata && metadata < descriptionPanel, `${page} should keep title and metadata first`);
    assert.ok(descriptionPanel < heart && heart < description, `${page} should put the heart immediately before its description`);
    assert.ok(description < gallery, `${page} should keep the identity, heart, and description ahead of the gallery`);
  }
});

test("Things to Do hearts appear after quick facts and directly before the hero description", async () => {
  for (const page of thingsPages) {
    const html = await read(page);
    const heroStart = html.indexOf('<div class="fishport-hero-copy">');
    const heroEnd = html.indexOf("</section>", heroStart);
    const hero = html.slice(heroStart, heroEnd);
    const title = hero.indexOf("<h1>");
    const metadata = hero.indexOf('<div class="fishport-fact-row"');
    const heart = hero.indexOf("data-place-reactions");
    const description = hero.indexOf("<p>", heart);

    assert.ok(title < metadata && metadata < heart, `${page} should put quick facts before the heart`);
    assert.ok(heart < description, `${page} should put the heart directly before the hero description`);
  }
});

test("index, utility, and travel-guide pages do not receive place hearts", async () => {
  for (const page of excludedPages) {
    assert.doesNotMatch(await read(page), /data-place-reactions/u, `${page} should remain excluded`);
  }
});

test("shared frontend contains the compact place-heart states and confirmation copy", async () => {
  const script = await read("assets/js/main.js");

  assert.match(script, /data-place-love-icon/u);
  assert.match(script, /Show some love/u);
  assert.match(script, /Loved/u);
  assert.match(script, /person loved this place/u);
  assert.match(script, /people loved this place/u);
  assert.match(script, /Thanks for supporting this local spot!/u);
  assert.match(script, /\[data-guide-reactions\], \[data-place-reactions\]/u);
});

test("every published hotel has a unique namespaced place key", async () => {
  const hotels = JSON.parse(await read("data/hotels.json"));
  const hotelKeys = hotels.map((hotel) => hotel.reactionKey);
  const existingPlaceKeys = new Set(Object.values(eligiblePages));

  assert.equal(hotels.length, 15);
  assert.equal(new Set(hotelKeys).size, hotels.length, "hotel reaction keys should be unique");

  hotels.forEach((hotel) => {
    assert.match(hotel.reactionKey, /^place:hotel-[a-z0-9-]+$/u, `${hotel.title} should use the hotel place namespace`);
    assert.equal(existingPlaceKeys.has(hotel.reactionKey), false, `${hotel.title} should not reuse another place key`);
  });
});

test("hotel hearts render after the guide intro and outside the detailed showcase card", async () => {
  const html = await read("hotels.html");
  const script = await read("assets/js/main.js");
  const listingRenderer = script.slice(script.indexOf("function renderCard"), script.indexOf("function renderFeaturedCard"));
  const detailRenderer = script.slice(script.indexOf("function renderFeaturedCard"), script.indexOf("function buildGettingThere"));
  const guideRenderer = script.slice(script.indexOf("async function renderGuideHotel"), script.indexOf("async function renderCategoryHotels"));
  const title = html.indexOf('id="featured-hotel-title"');
  const intro = html.indexOf("Showing business hotels", title);
  const reactionHost = html.indexOf("data-hotel-guide-reaction", intro);
  const showcase = html.indexOf('data-featured-list="hotels"', reactionHost);
  const introUpdate = guideRenderer.indexOf("intro.textContent");
  const reaction = guideRenderer.indexOf("reactionRegion.innerHTML");
  const card = guideRenderer.indexOf("container.innerHTML = renderFeaturedCard(item)");

  assert.doesNotMatch(html, /data-place-reactions/u, "hotel listing markup should not contain a pre-rendered heart");
  assert.doesNotMatch(listingRenderer, /data-place-reactions/u, "normal hotel listing cards should not render hearts");
  assert.doesNotMatch(detailRenderer, /data-place-reactions/u, "the bordered hotel showcase should not render a heart");
  assert.ok(title < intro && intro < reactionHost && reactionHost < showcase, "the hotel heart host should sit after the intro and before the showcase");
  assert.ok(introUpdate < reaction && reaction < card, "the selected hotel heart should render before its showcase card");
  assert.match(guideRenderer, /data-reaction-key="\$\{escapeAttribute\(reactionKey\)\}"/u);
  assert.match(guideRenderer, /initializeReactionContainers\(reactionRegion\)/u);
});

class MemoryReactionDb {
  constructor() {
    this.reactions = new Map();
    this.rateLimits = new Map();
  }

  prepare(sql) {
    const database = this;

    return {
      bind(...args) {
        return {
          async first() {
            if (sql.includes("guide_reaction_rate_limits")) {
              return database.rateLimits.get(args[0]) || null;
            }

            if (sql.includes("SELECT reaction FROM guide_reactions")) {
              return database.reactions.get(`${args[0]}|${args[1]}`) || null;
            }

            return null;
          },
          async all() {
            const totals = new Map();

            for (const row of database.reactions.values()) {
              if (row.page === args[0]) totals.set(row.reaction, (totals.get(row.reaction) || 0) + 1);
            }

            return {
              results: Array.from(totals, ([reaction, count]) => ({ reaction, count }))
            };
          },
          async run() {
            if (sql.includes("INSERT OR REPLACE INTO guide_reaction_rate_limits")) {
              database.rateLimits.set(args[0], { window_start: args[1], attempt_count: 1 });
              return { meta: { changes: 1 } };
            }

            if (sql.includes("UPDATE guide_reaction_rate_limits")) {
              const row = database.rateLimits.get(args[1]);
              database.rateLimits.set(args[1], { ...row, attempt_count: args[0] });
              return { meta: { changes: 1 } };
            }

            if (sql.includes("INSERT INTO guide_reactions")) {
              const key = `${args[0]}|${args[1]}`;
              if (database.reactions.has(key)) return { meta: { changes: 0 } };
              database.reactions.set(key, { page: args[0], visitor_id: args[1], reaction: args[2] });
              return { meta: { changes: 1 } };
            }

            return { meta: { changes: 0 } };
          }
        };
      }
    };
  }
}

function reactionRequest(page, visitor, reaction) {
  return new Request("https://visitgensan.com/api/reactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.20",
      "User-Agent": "VisitGenSan reaction test"
    },
    body: JSON.stringify({ page, visitor, reaction })
  });
}

async function callApi(db, request) {
  return handleReactions({ request, env: { VISITGENSAN_DB: db } });
}

async function json(response) {
  return JSON.parse(await response.text());
}

test("place love and guide feedback use the same API but maintain isolated counts", async () => {
  const db = new MemoryReactionDb();
  const visitor = "stable-reaction-visitor-123456";
  const placeKey = "place:j-hills-golf-range-and-restaurant";
  const guideKey = "j-hills-golf-range-and-restaurant.html";

  const placeResponse = await callApi(db, reactionRequest(placeKey, visitor, "love"));
  assert.equal(placeResponse.status, 200);
  assert.deepEqual(await json(placeResponse), { page: placeKey, totals: { love: 1 }, selected: "love" });

  const guideResponse = await callApi(db, reactionRequest(guideKey, visitor, "happy"));
  assert.equal(guideResponse.status, 200);
  assert.deepEqual(await json(guideResponse), {
    page: guideKey,
    totals: { happy: 1, surprised: 0, sad: 0, angry: 0 },
    selected: "happy"
  });

  const duplicate = await callApi(db, reactionRequest(placeKey, visitor, "love"));
  assert.equal(duplicate.status, 409);
  assert.equal((await json(duplicate)).totals.love, 1);

  const getResponse = await callApi(db, new Request(
    `https://visitgensan.com/api/reactions?page=${encodeURIComponent(placeKey)}&visitor=${visitor}`
  ));
  assert.equal(getResponse.status, 200);
  assert.deepEqual(await json(getResponse), { page: placeKey, totals: { love: 1 }, selected: "love" });
});

test("the API recognizes every place key published in eligible detail-page markup", async () => {
  const db = new MemoryReactionDb();

  for (const key of Object.values(eligiblePages)) {
    const response = await callApi(db, new Request(
      `https://visitgensan.com/api/reactions?page=${encodeURIComponent(key)}`
    ));

    assert.equal(response.status, 200, `${key} should be accepted by the shared API`);
    assert.deepEqual((await json(response)).totals, { love: 0 });
  }
});

test("the shared API recognizes every hotel place key", async () => {
  const db = new MemoryReactionDb();
  const hotels = JSON.parse(await read("data/hotels.json"));

  for (const hotel of hotels) {
    const response = await callApi(db, new Request(
      `https://visitgensan.com/api/reactions?page=${encodeURIComponent(hotel.reactionKey)}`
    ));

    assert.equal(response.status, 200, `${hotel.title} should be accepted by the shared API`);
    assert.deepEqual((await json(response)).totals, { love: 0 });
  }
});

test("hotel counts are isolated and duplicate prevention matches other place reactions", async () => {
  const db = new MemoryReactionDb();
  const visitor = "hotel-reaction-visitor-123456";
  const hotelA = "place:hotel-greenleaf-hotel-gensan";
  const hotelB = "place:hotel-avior-hotel";

  const firstHotel = await callApi(db, reactionRequest(hotelA, visitor, "love"));
  const secondHotel = await callApi(db, reactionRequest(hotelB, visitor, "love"));
  const duplicate = await callApi(db, reactionRequest(hotelA, visitor, "love"));

  assert.equal(firstHotel.status, 200);
  assert.equal(secondHotel.status, 200);
  assert.equal(duplicate.status, 409);
  assert.deepEqual((await json(firstHotel)).totals, { love: 1 });
  assert.deepEqual((await json(secondHotel)).totals, { love: 1 });
  assert.deepEqual((await json(duplicate)).totals, { love: 1 });
});

test("the API enforces the reaction type associated with each resource key", async () => {
  const db = new MemoryReactionDb();
  const visitor = "different-reaction-visitor-123456";

  const placeEmoji = await callApi(db, reactionRequest("place:fish-port-complex", visitor, "happy"));
  const guideLove = await callApi(db, reactionRequest("fish-port-complex.html", visitor, "love"));

  assert.equal(placeEmoji.status, 400);
  assert.equal(guideLove.status, 400);
});
