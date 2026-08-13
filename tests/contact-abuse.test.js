import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTACT_ABUSE_LIMITS,
  buildContactIdentityKey,
  cleanupExpiredContactAbuseRecords,
  enforceContactRateLimit,
  reserveContactDuplicate
} from "../functions/_lib/contact-abuse.js";

class MemoryStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql.replace(/\s+/gu, " ").trim();
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  run() {
    return this.db.execute(this);
  }
}

class MemoryD1 {
  constructor() {
    this.records = new Map();
  }

  prepare(sql) {
    return new MemoryStatement(this, sql);
  }

  async batch(statements) {
    const snapshot = new Map(this.records);
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    } catch (error) {
      this.records = snapshot;
      throw error;
    }
  }

  execute(statement) {
    const { sql, args } = statement;

    if (sql.startsWith("DELETE FROM contact_abuse_records WHERE expires_at <=")) {
      let changes = 0;
      for (const [key, record] of this.records) {
        if (record.expiresAt <= args[0]) {
          this.records.delete(key);
          changes += 1;
        }
      }
      return { success: true, results: [], meta: { changes } };
    }

    if (sql.includes("VALUES ('duplicate', ?, 0, 1, ?)")) {
      const [recordKey, expiresAt] = args;
      const key = `duplicate|${recordKey}|0`;
      if (this.records.has(key)) return { success: true, results: [], meta: { changes: 0 } };
      this.records.set(key, { type: "duplicate", recordKey, windowStart: 0, count: 1, expiresAt });
      return { success: true, results: [{ attempt_count: 1 }], meta: { changes: 1 } };
    }

    if (sql.startsWith("INSERT INTO contact_abuse_records")) {
      const [type, recordKey, windowStart, expiresAt] = args;
      const key = `${type}|${recordKey}|${windowStart}`;
      const current = this.records.get(key);
      const count = (current?.count || 0) + 1;
      this.records.set(key, { type, recordKey, windowStart, count, expiresAt });
      return { success: true, results: [{ attempt_count: count }], meta: { changes: 1 } };
    }

    throw new Error(`Unhandled test SQL: ${sql}`);
  }
}

test("rate limits the sixth attempt in 15 minutes", async () => {
  const db = new MemoryD1();
  const now = Date.UTC(2026, 7, 13, 12, 0, 0);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    assert.equal((await enforceContactRateLimit(db, "identity", now)).limited, false);
  }

  const blocked = await enforceContactRateLimit(db, "identity", now);
  assert.equal(blocked.limited, true);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test("rate limits the eleventh attempt across short-window boundaries in 24 hours", async () => {
  const db = new MemoryD1();
  const start = Date.UTC(2026, 7, 13, 0, 0, 0);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await enforceContactRateLimit(db, "identity", start + attempt * 20 * 60 * 1000);
    assert.equal(result.limited, false);
  }

  const blocked = await enforceContactRateLimit(db, "identity", start + 220 * 60 * 1000);
  assert.equal(blocked.limited, true);
});

test("suppresses duplicate submissions and permits them after expiry cleanup", async () => {
  const db = new MemoryD1();
  const now = Date.UTC(2026, 7, 13, 12, 0, 0);

  assert.equal(await reserveContactDuplicate(db, "duplicate-key", now), true);
  assert.equal(await reserveContactDuplicate(db, "duplicate-key", now + 1), false);

  await cleanupExpiredContactAbuseRecords(db, now + CONTACT_ABUSE_LIMITS.duplicateTtlMs + 1);
  assert.equal(await reserveContactDuplicate(db, "duplicate-key", now + CONTACT_ABUSE_LIMITS.duplicateTtlMs + 1), true);
});

test("opportunistic cleanup actually deletes expired records", async () => {
  const db = new MemoryD1();
  db.records.set("duplicate|expired|0", {
    type: "duplicate",
    recordKey: "expired",
    windowStart: 0,
    count: 1,
    expiresAt: 100
  });

  await cleanupExpiredContactAbuseRecords(db, 101);
  assert.equal(db.records.size, 0);
});

test("identity hashing uses Cloudflare client IP and never returns the raw address", async () => {
  const request = new Request("https://visitgensan.com/api/contact", {
    headers: { "CF-Connecting-IP": "203.0.113.8", "X-Forwarded-For": "198.51.100.1" }
  });
  const key = await buildContactIdentityKey(request, "test-pepper");

  assert.match(key, /^[a-f0-9]{64}$/u);
  assert.ok(!key.includes("203.0.113.8"));
  assert.ok(!key.includes("198.51.100.1"));
});
