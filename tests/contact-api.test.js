import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTACT_MAX_BODY_BYTES,
  createContactHandler,
  verifyTurnstileToken
} from "../functions/api/contact.js";

const validPayload = Object.freeze({
  name: "Visitor Name",
  email: "visitor@example.com",
  subject: "Guide question",
  message: "Please check this guide detail.",
  turnstileToken: "valid-turnstile-token",
  website: ""
});

function createEnv() {
  return {
    VISITGENSAN_DB: { test: true },
    CONTACT_RATE_LIMIT_PEPPER: "pepper-test-value",
    TURNSTILE_SECRET_KEY: "turnstile-test-secret",
    APPS_SCRIPT_CONTACT_URL: "https://script.google.com/macros/s/test/exec",
    CONTACT_SHARED_SECRET: "provider-test-secret"
  };
}

function createRequest(payload = validPayload, options = {}) {
  const headers = {
    "Content-Type": options.contentType || "application/json",
    "CF-Connecting-IP": "203.0.113.25",
    Origin: options.origin || "https://visitgensan.com",
    ...options.headers
  };

  return new Request("https://visitgensan.com/api/contact", {
    method: options.method || "POST",
    headers,
    body: options.body === undefined ? JSON.stringify(payload) : options.body
  });
}

function createHandler(overrides = {}) {
  return createContactHandler({
    enforceRateLimit: async () => ({ limited: false, retryAfterSeconds: 0 }),
    verifyTurnstile: async () => ({ valid: true, unavailable: false }),
    reserveDuplicate: async () => true,
    releaseDuplicate: async () => {},
    forwardContact: async () => ({ ok: true, retryable: false }),
    ...overrides
  });
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

test("accepts a valid submission with the documented success contract", async () => {
  const response = await createHandler()({ request: createRequest(), env: createEnv() });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await readJson(response), { ok: true, message: "Your message has been sent." });
});

test("allows only POST and returns an Allow header", async () => {
  const request = new Request("https://visitgensan.com/api/contact", { method: "GET" });
  const response = await createHandler()({ request, env: createEnv() });

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.equal((await readJson(response)).code, "METHOD_NOT_ALLOWED");
});

test("rejects wrong Content-Type, cross-site Origin, and malformed JSON", async () => {
  const handler = createHandler();
  const wrongType = await handler({
    request: createRequest(validPayload, { contentType: "text/plain" }),
    env: createEnv()
  });
  const crossSite = await handler({
    request: createRequest(validPayload, { origin: "https://malicious.example" }),
    env: createEnv()
  });
  const malformed = await handler({
    request: createRequest(null, { body: "{not-json" }),
    env: createEnv()
  });

  assert.equal(wrongType.status, 415);
  assert.equal(crossSite.status, 403);
  assert.equal(malformed.status, 400);
});

test("rejects array JSON, unknown keys, and wrong field types", async () => {
  const handler = createHandler();
  const arrayResponse = await handler({ request: createRequest([]), env: createEnv() });
  const unknownResponse = await handler({
    request: createRequest({ ...validPayload, recipient: "private@example.com" }),
    env: createEnv()
  });
  const wrongTypeResponse = await handler({
    request: createRequest({ ...validPayload, name: { nested: true } }),
    env: createEnv()
  });

  assert.equal((await readJson(arrayResponse)).code, "INVALID_REQUEST");
  assert.equal((await readJson(unknownResponse)).code, "INVALID_REQUEST");
  assert.equal((await readJson(wrongTypeResponse)).code, "VALIDATION_ERROR");
});

test("rejects bodies over 32 KiB", async () => {
  const response = await createHandler()({
    request: createRequest(null, { body: "x".repeat(CONTACT_MAX_BODY_BYTES + 1) }),
    env: createEnv()
  });

  assert.equal(response.status, 413);
  assert.equal((await readJson(response)).code, "REQUEST_TOO_LARGE");
});

test("requires a Turnstile token before calling verification", async () => {
  let verificationCalled = false;
  const handler = createHandler({
    verifyTurnstile: async () => {
      verificationCalled = true;
      return { valid: true, unavailable: false };
    }
  });
  const response = await handler({
    request: createRequest({ ...validPayload, turnstileToken: "" }),
    env: createEnv()
  });

  assert.equal(response.status, 400);
  assert.equal((await readJson(response)).code, "VALIDATION_ERROR");
  assert.equal(verificationCalled, false);
});

test("silently accepts a filled honeypot without forwarding", async () => {
  let forwarded = false;
  const handler = createHandler({
    forwardContact: async () => {
      forwarded = true;
      return { ok: true, retryable: false };
    }
  });
  const response = await handler({
    request: createRequest({ ...validPayload, website: "bot.example" }),
    env: createEnv()
  });

  assert.equal(response.status, 200);
  assert.equal((await readJson(response)).ok, true);
  assert.equal(forwarded, false);
});

test("returns the documented rate-limit response", async () => {
  const handler = createHandler({
    enforceRateLimit: async () => ({ limited: true, retryAfterSeconds: 120 })
  });
  const response = await handler({ request: createRequest(), env: createEnv() });
  const result = await readJson(response);

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "120");
  assert.deepEqual(result, {
    ok: false,
    code: "RATE_LIMITED",
    message: "Please wait before sending another message."
  });
});

test("rejects Turnstile failure and hostname/action mismatch", async () => {
  const failed = await verifyTurnstileToken({
    token: "token",
    secret: "secret",
    clientIp: "203.0.113.25",
    hostname: "visitgensan.com",
    fetchImpl: async () => Response.json({ success: false })
  });
  const hostnameMismatch = await verifyTurnstileToken({
    token: "token",
    secret: "secret",
    clientIp: "203.0.113.25",
    hostname: "visitgensan.com",
    fetchImpl: async () => Response.json({ success: true, hostname: "example.com", action: "contact" })
  });
  const actionMismatch = await verifyTurnstileToken({
    token: "token",
    secret: "secret",
    clientIp: "203.0.113.25",
    hostname: "visitgensan.com",
    fetchImpl: async () => Response.json({ success: true, hostname: "visitgensan.com", action: "login" })
  });

  assert.equal(failed.valid, false);
  assert.equal(hostnameMismatch.valid, false);
  assert.equal(actionMismatch.valid, false);
});

test("suppresses a reserved duplicate without delivering twice", async () => {
  let deliveryCalled = false;
  const handler = createHandler({
    reserveDuplicate: async () => false,
    forwardContact: async () => {
      deliveryCalled = true;
      return { ok: true, retryable: false };
    }
  });
  const response = await handler({ request: createRequest(), env: createEnv() });

  assert.equal(response.status, 200);
  assert.equal(deliveryCalled, false);
});

test("maps provider failure to a generic response and releases duplicate reservation", async () => {
  let duplicateReleased = false;
  const handler = createHandler({
    releaseDuplicate: async () => { duplicateReleased = true; },
    forwardContact: async () => ({
      ok: false,
      retryable: false,
      internal: "private@example.com provider stack secret-value"
    })
  });
  const response = await handler({ request: createRequest(), env: createEnv() });
  const responseText = await response.text();

  assert.equal(response.status, 502);
  assert.equal(duplicateReleased, true);
  assert.match(responseText, /SEND_FAILED/u);
  assert.doesNotMatch(responseText, /private@example\.com|provider stack|secret-value/u);
});
