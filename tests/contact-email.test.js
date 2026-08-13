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

function createDiagnosticLogger() {
  const events = [];
  return {
    events,
    logger: {
      info(entry) {
        events.push(JSON.parse(entry));
      }
    }
  };
}

test("forwards the exact Apps Script JSON contract and follows the ContentService redirect", async () => {
  let forwardedBody;
  const diagnostics = createDiagnosticLogger();
  const result = await forwardContactToAppsScript(values, env, {
    logger: diagnostics.logger,
    fetchImpl: async (url, options) => {
      assert.equal(url, env.APPS_SCRIPT_CONTACT_URL);
      assert.equal(options.method, "POST");
      assert.equal(options.redirect, "follow");
      assert.equal(options.headers["Content-Type"], "application/json; charset=UTF-8");
      forwardedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(forwardedBody).sort(), ["email", "message", "name", "sharedSecret", "subject"]);
  assert.equal(forwardedBody.sharedSecret, env.CONTACT_SHARED_SECRET);
  assert.equal(forwardedBody.secret, undefined);
  assert.equal(forwardedBody.turnstileToken, undefined);
  assert.deepEqual(
    diagnostics.events.map(({ event }) => event),
    ["apps_script_request_started", "apps_script_success"]
  );
});

test("categorizes Apps Script unauthorized and validation responses without exposing them publicly", async () => {
  const unauthorizedDiagnostics = createDiagnosticLogger();
  const unauthorized = await forwardContactToAppsScript(values, env, {
    logger: unauthorizedDiagnostics.logger,
    fetchImpl: async () => new Response(JSON.stringify({ ok: false, code: "UNAUTHORIZED" }), { status: 200 })
  });
  const validationDiagnostics = createDiagnosticLogger();
  const validationFailure = await forwardContactToAppsScript(values, env, {
    logger: validationDiagnostics.logger,
    fetchImpl: async () => new Response(JSON.stringify({ ok: false, code: "VALIDATION_ERROR" }), { status: 200 })
  });

  assert.deepEqual(unauthorized, { ok: false, retryable: false });
  assert.deepEqual(validationFailure, { ok: false, retryable: false });
  assert.equal(unauthorizedDiagnostics.events.at(-1).event, "apps_script_unauthorized");
  assert.equal(validationDiagnostics.events.at(-1).event, "apps_script_validation_failure");
});

test("rejects malformed provider JSON and network failure", async () => {
  const malformedDiagnostics = createDiagnosticLogger();
  const malformed = await forwardContactToAppsScript(values, env, {
    logger: malformedDiagnostics.logger,
    fetchImpl: async () => new Response("not json", { status: 200 })
  });
  const networkDiagnostics = createDiagnosticLogger();
  const network = await forwardContactToAppsScript(values, env, {
    logger: networkDiagnostics.logger,
    fetchImpl: async () => { throw new Error("private provider error"); }
  });

  assert.deepEqual(malformed, { ok: false, retryable: true });
  assert.deepEqual(network, { ok: false, retryable: true });
  assert.equal(malformedDiagnostics.events.at(-1).event, "apps_script_non_json_response");
  assert.equal(networkDiagnostics.events.at(-1).event, "apps_script_network_failure");
});

test("categorizes provider timeout and HTTP failure", async () => {
  const timeoutDiagnostics = createDiagnosticLogger();
  const timeout = await forwardContactToAppsScript(values, env, {
    logger: timeoutDiagnostics.logger,
    timeoutMs: 5,
    fetchImpl: async (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("provider request aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    })
  });
  const httpDiagnostics = createDiagnosticLogger();
  const httpFailure = await forwardContactToAppsScript(values, env, {
    logger: httpDiagnostics.logger,
    fetchImpl: async () => new Response("private provider response", { status: 503 })
  });

  assert.deepEqual(timeout, { ok: false, retryable: true });
  assert.deepEqual(httpFailure, { ok: false, retryable: true });
  assert.equal(timeoutDiagnostics.events.at(-1).event, "apps_script_timeout");
  assert.deepEqual(httpDiagnostics.events.at(-1), {
    scope: "contact_delivery",
    event: "apps_script_http_failure",
    elapsedMs: httpDiagnostics.events.at(-1).elapsedMs,
    httpStatusClass: 5
  });
});

test("refuses missing credentials or a non-Google delivery URL without sending", async () => {
  let called = false;
  const invalidUrlDiagnostics = createDiagnosticLogger();
  const invalidUrl = await forwardContactToAppsScript(values, {
    ...env,
    APPS_SCRIPT_CONTACT_URL: "https://example.com/collect"
  }, {
    logger: invalidUrlDiagnostics.logger,
    fetchImpl: async () => { called = true; }
  });
  const missingSecretDiagnostics = createDiagnosticLogger();
  const missingSecret = await forwardContactToAppsScript(values, {
    APPS_SCRIPT_CONTACT_URL: env.APPS_SCRIPT_CONTACT_URL
  }, {
    logger: missingSecretDiagnostics.logger,
    fetchImpl: async () => { called = true; }
  });

  assert.equal(called, false);
  assert.deepEqual(invalidUrl, { ok: false, retryable: true });
  assert.deepEqual(missingSecret, { ok: false, retryable: true });
  assert.equal(invalidUrlDiagnostics.events.at(-1).event, "apps_script_configuration_failure");
  assert.equal(missingSecretDiagnostics.events.at(-1).event, "apps_script_configuration_failure");
});

test("privacy-safe diagnostics never contain secrets or visitor content", async () => {
  const diagnostics = createDiagnosticLogger();
  await forwardContactToAppsScript(values, env, {
    logger: diagnostics.logger,
    fetchImpl: async () => new Response(JSON.stringify({
      ok: false,
      code: "UNKNOWN_PRIVATE_CODE",
      message: `do not log ${values.email} ${env.CONTACT_SHARED_SECRET}`
    }), { status: 200 })
  });

  const serializedDiagnostics = JSON.stringify(diagnostics.events);
  assert.doesNotMatch(serializedDiagnostics, new RegExp(values.name, "u"));
  assert.doesNotMatch(serializedDiagnostics, new RegExp(values.email, "u"));
  assert.doesNotMatch(serializedDiagnostics, new RegExp(values.subject, "u"));
  assert.doesNotMatch(serializedDiagnostics, new RegExp(env.CONTACT_SHARED_SECRET, "u"));
  assert.doesNotMatch(serializedDiagnostics, /UNKNOWN_PRIVATE_CODE|do not log/u);
  assert.equal(diagnostics.events.at(-1).event, "apps_script_rejected");
});
