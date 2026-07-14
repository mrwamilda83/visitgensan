const VALID_REACTIONS = new Set(["happy", "surprised", "sad", "angry"]);
const VALID_PAGES = new Set([
  "fish-port-complex.html",
  "plaza-heneral-santos.html",
  "sarangani-highlands-garden.html"
]);
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      "cdn-cache-control": "no-store",
      "cloudflare-cdn-cache-control": "no-store",
      ...extraHeaders
    }
  });
}

function getClientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
}

function normalizePage(value) {
  const rawPage = String(value || "").trim().toLowerCase().split("?")[0].split("#")[0];
  const pageName = rawPage.split("/").filter(Boolean).pop() || "";
  const page = pageName && !pageName.endsWith(".html") ? `${pageName}.html` : pageName;
  return VALID_PAGES.has(page) ? page : "";
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function buildVisitorId(request, token) {
  const tokenPart = String(token || "").trim().slice(0, 120);
  return sha256(tokenPart);
}

async function buildRateLimitKey(request, visitorId) {
  const userAgent = request.headers.get("User-Agent") || "unknown";
  const ip = getClientIp(request);
  return sha256(`${visitorId}|${ip}|${userAgent}`);
}

async function enforceRateLimit(db, visitorId) {
  const now = Date.now();
  const row = await db.prepare(
    "SELECT window_start, attempt_count FROM guide_reaction_rate_limits WHERE visitor_key = ?"
  ).bind(visitorId).first();

  if (!row || now - Number(row.window_start) > RATE_LIMIT_WINDOW_MS) {
    await db.prepare(
      "INSERT OR REPLACE INTO guide_reaction_rate_limits (visitor_key, window_start, attempt_count) VALUES (?, ?, 1)"
    ).bind(visitorId, now).run();
    return null;
  }

  const nextCount = Number(row.attempt_count || 0) + 1;
  await db.prepare(
    "UPDATE guide_reaction_rate_limits SET attempt_count = ? WHERE visitor_key = ?"
  ).bind(nextCount, visitorId).run();

  if (nextCount > RATE_LIMIT_MAX_ATTEMPTS) {
    return jsonResponse({ error: "Too many reaction changes. Please wait a moment and try again." }, 429);
  }

  return null;
}

async function getTotals(db, page) {
  const result = {
    happy: 0,
    surprised: 0,
    sad: 0,
    angry: 0
  };

  const { results = [] } = await db.prepare(
    "SELECT reaction, COUNT(*) AS count FROM guide_reactions WHERE page = ? GROUP BY reaction"
  ).bind(page).all();

  results.forEach((row) => {
    if (VALID_REACTIONS.has(row.reaction)) {
      result[row.reaction] = Number(row.count || 0);
    }
  });

  return result;
}

async function getSelectedReaction(db, page, visitorId) {
  const row = await db.prepare(
    "SELECT reaction FROM guide_reactions WHERE page = ? AND visitor_id = ?"
  ).bind(page, visitorId).first();
  return row?.reaction || null;
}

async function handleGet(request, db) {
  const url = new URL(request.url);
  const page = normalizePage(url.searchParams.get("page"));

  if (!page) {
    return jsonResponse({ error: "Unknown guide page." }, 400);
  }

  const token = url.searchParams.get("visitor") || "";
  const visitorId = token ? await buildVisitorId(request, token) : "";
  const totals = await getTotals(db, page);
  const selected = visitorId ? await getSelectedReaction(db, page, visitorId) : null;

  return jsonResponse({ page, totals, selected });
}

async function handlePost(request, db) {
  let payload;

  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const page = normalizePage(payload?.page);
  const reaction = String(payload?.reaction || "").toLowerCase();
  const visitorToken = String(payload?.visitor || "").trim();

  if (!page) {
    return jsonResponse({ error: "Unknown guide page." }, 400);
  }

  if (!VALID_REACTIONS.has(reaction)) {
    return jsonResponse({ error: "Unknown reaction." }, 400);
  }

  if (visitorToken.length < 16) {
    return jsonResponse({ error: "Missing visitor token." }, 400);
  }

  const visitorId = await buildVisitorId(request, visitorToken);
  const rateLimitKey = await buildRateLimitKey(request, visitorId);
  const rateLimitResponse = await enforceRateLimit(db, rateLimitKey);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  await db.prepare(
    `INSERT INTO guide_reactions (page, visitor_id, reaction, created_at, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(page, visitor_id) DO UPDATE SET
       reaction = excluded.reaction,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(page, visitorId, reaction).run();

  const totals = await getTotals(db, page);
  return jsonResponse({ page, totals, selected: reaction });
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.VISITGENSAN_DB;

  if (!db) {
    return jsonResponse({ error: "Reaction database is not configured." }, 503);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400"
      }
    });
  }

  try {
    if (request.method === "GET") {
      return await handleGet(request, db);
    }

    if (request.method === "POST") {
      return await handlePost(request, db);
    }

    return jsonResponse({ error: "Method not allowed." }, 405, { allow: "GET, POST, OPTIONS" });
  } catch (error) {
    return jsonResponse({ error: "Unable to save guide reaction." }, 500);
  }
}
