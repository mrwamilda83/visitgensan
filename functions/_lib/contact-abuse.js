const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const CONTACT_ABUSE_LIMITS = Object.freeze({
  short: Object.freeze({ type: "attempt_15m", windowMs: FIFTEEN_MINUTES_MS, maxAttempts: 5 }),
  daily: Object.freeze({ type: "attempt_24h", windowMs: TWENTY_FOUR_HOURS_MS, maxAttempts: 10 }),
  duplicateTtlMs: FIFTEEN_MINUTES_MS
});

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToHex(new Uint8Array(signature));
}

export function getTrustedClientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

export async function buildContactIdentityKey(request, pepper) {
  return hmacSha256(pepper, `contact-ip:${getTrustedClientIp(request)}`);
}

export async function buildContactDuplicateKey(values, identityKey, pepper) {
  return hmacSha256(
    pepper,
    [
      "contact-submission",
      identityKey,
      values.name,
      values.email,
      values.subject,
      values.message
    ].join("\u001f")
  );
}

export async function cleanupExpiredContactAbuseRecords(db, now = Date.now()) {
  await db.prepare(
    "DELETE FROM contact_abuse_records WHERE expires_at <= ?"
  ).bind(now).run();
}

function createRateLimitStatement(db, type, identityKey, windowStart, expiresAt) {
  return db.prepare(
    `INSERT INTO contact_abuse_records
      (record_type, record_key, window_start, attempt_count, expires_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(record_type, record_key, window_start)
     DO UPDATE SET
       attempt_count = contact_abuse_records.attempt_count + 1,
       expires_at = excluded.expires_at
     RETURNING attempt_count`
  ).bind(type, identityKey, windowStart, expiresAt);
}

function getReturnedAttemptCount(result) {
  return Number(result?.results?.[0]?.attempt_count || 0);
}

export async function enforceContactRateLimit(db, identityKey, now = Date.now()) {
  await cleanupExpiredContactAbuseRecords(db, now);

  const windows = [CONTACT_ABUSE_LIMITS.short, CONTACT_ABUSE_LIMITS.daily];
  const statements = windows.map((limit) => {
    const windowStart = Math.floor(now / limit.windowMs) * limit.windowMs;
    return createRateLimitStatement(db, limit.type, identityKey, windowStart, windowStart + limit.windowMs);
  });
  const results = await db.batch(statements);

  const exceededWindows = windows.filter((limit, index) => {
    return getReturnedAttemptCount(results[index]) > limit.maxAttempts;
  });
  const limited = exceededWindows.length > 0;

  if (!limited) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  const retryAfterMs = Math.max(...exceededWindows.map((limit) => {
    const windowStart = Math.floor(now / limit.windowMs) * limit.windowMs;
    return windowStart + limit.windowMs - now;
  }));

  return {
    limited: true,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
  };
}

export async function reserveContactDuplicate(db, duplicateKey, now = Date.now()) {
  const result = await db.prepare(
    `INSERT INTO contact_abuse_records
      (record_type, record_key, window_start, attempt_count, expires_at)
     VALUES ('duplicate', ?, 0, 1, ?)
     ON CONFLICT(record_type, record_key, window_start) DO NOTHING
     RETURNING attempt_count`
  ).bind(duplicateKey, now + CONTACT_ABUSE_LIMITS.duplicateTtlMs).run();

  return Number(result?.meta?.changes || result?.results?.length || 0) > 0;
}

export async function releaseContactDuplicate(db, duplicateKey) {
  await db.prepare(
    "DELETE FROM contact_abuse_records WHERE record_type = 'duplicate' AND record_key = ? AND window_start = 0"
  ).bind(duplicateKey).run();
}
