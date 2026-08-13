import test from "node:test";
import assert from "node:assert/strict";

import { forwardContactToAppsScript } from "../functions/_lib/contact-email.js";

const values = Object.freeze({
  name: "Visitor Name",
  email: "visitor@example.com",
  subject: "Guide question",
  message: "Please check this guide detail.",
  turnstileToken: "not-forwarded",
  website: ""
});
const env = Object.freeze({
  APPS_SCRIPT_CONTACT_URL: "https://script.google.com/macros/s/test-deployment/exec",
  CONTACT_SHARED_SECRET: "private-test-secret"
});

test("forwards only validated contact fields and the shared secret", async () => {
  let forwardedBody;
  const result = await forwardContactToAppsScript(values, env, {
    fetchImpl: async (url, options) => {
      assert.equal(url, env.APPS_SCRIPT_CONTACT_URL);
      assert.equal(options.method, "POST");
      assert.equal(options.redirect, "follow");
      forwardedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(forwardedBody).sort(), ["email", "message", "name", "secret", "subject"]);
  assert.equal(forwardedBody.secret, env.CONTACT_SHARED_SECRET);
  assert.equal(forwardedBody.turnstileToken, undefined);
});

test("treats unauthorized and provider validation responses as safe failures", async () => {
  const unauthorized = await forwardContactToAppsScript(values, env, {
    fetchImpl: async () => new Response(JSON.stringify({ ok: false, internal: "do not expose" }), { status: 401 })
  });
  const validationFailure = await forwardContactToAppsScript(values, env, {
    fetchImpl: async () => new Response(JSON.stringify({ ok: false, code: "VALIDATION_ERROR" }), { status: 200 })
  });

  assert.deepEqual(unauthorized, { ok: false, retryable: false });
  assert.deepEqual(validationFailure, { ok: false, retryable: false });
});

test("rejects malformed provider JSON and network failure", async () => {
  const malformed = await forwardContactToAppsScript(values, env, {
    fetchImpl: async () => new Response("not json", { status: 200 })
  });
  const network = await forwardContactToAppsScript(values, env, {
    fetchImpl: async () => { throw new Error("private provider error"); }
  });

  assert.deepEqual(malformed, { ok: false, retryable: true });
  assert.deepEqual(network, { ok: false, retryable: true });
});

test("refuses a misconfigured non-Google delivery URL without sending the secret", async () => {
  let called = false;
  const result = await forwardContactToAppsScript(values, {
    ...env,
    APPS_SCRIPT_CONTACT_URL: "https://example.com/collect"
  }, {
    fetchImpl: async () => { called = true; }
  });

  assert.equal(called, false);
  assert.deepEqual(result, { ok: false, retryable: true });
});
