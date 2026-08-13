import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTACT_FIELD_RULES,
  countCodePoints,
  validateContactPayload
} from "../assets/js/contact-validation.js";

const validPayload = Object.freeze({
  name: "María O’Connor-Santos",
  email: "Visitor.Name+gensan@Example.COM",
  subject: "Question about a guide",
  message: "Could you please check this guide detail?",
  turnstileToken: "valid-turnstile-token",
  website: ""
});

test("accepts and normalizes a valid international-name submission", () => {
  const result = validateContactPayload({ ...validPayload, name: "  María   O’Connor-Santos  " });

  assert.equal(result.valid, true);
  assert.equal(result.values.name, "María O’Connor-Santos");
  assert.equal(result.values.email, "Visitor.Name+gensan@example.com");
});

test("rejects whitespace-only required fields", () => {
  const result = validateContactPayload({
    ...validPayload,
    name: "   ",
    subject: "\u00a0 ",
    message: "\n\t "
  });

  assert.equal(result.valid, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ["message", "name", "subject"]);
});

test("enforces name, subject, and message boundaries by Unicode code point", () => {
  const accepted = validateContactPayload({
    ...validPayload,
    name: "名名",
    subject: "S".repeat(CONTACT_FIELD_RULES.subject.max),
    message: "🙂".repeat(CONTACT_FIELD_RULES.message.max)
  });
  const rejected = validateContactPayload({
    ...validPayload,
    name: "N".repeat(CONTACT_FIELD_RULES.name.max + 1),
    subject: "S".repeat(CONTACT_FIELD_RULES.subject.max + 1),
    message: "🙂".repeat(CONTACT_FIELD_RULES.message.max + 1)
  });

  assert.equal(countCodePoints(accepted.values.message), CONTACT_FIELD_RULES.message.max);
  assert.equal(accepted.valid, true);
  assert.deepEqual(Object.keys(rejected.errors).sort(), ["message", "name", "subject"]);
});

test("rejects malformed email addresses and local parts over 64 characters", () => {
  for (const email of [
    "not-an-email",
    "a..b@example.com",
    ".ab@example.com",
    "ab@example",
    `${"a".repeat(65)}@example.com`
  ]) {
    const result = validateContactPayload({ ...validPayload, email });
    assert.equal(result.valid, false, email);
    assert.ok(result.errors.email, email);
  }
});

test("trims email but rejects CR/LF injection and internal whitespace", () => {
  const trimmed = validateContactPayload({ ...validPayload, email: "  Person@Example.com  " });
  const injected = validateContactPayload({ ...validPayload, email: "person@example.com\r\nBcc: victim@example.com" });
  const spaced = validateContactPayload({ ...validPayload, email: "person @example.com" });

  assert.equal(trimmed.values.email, "Person@example.com");
  assert.ok(injected.errors.email);
  assert.ok(spaced.errors.email);
});

test("rejects CR/LF header injection in single-line fields", () => {
  const result = validateContactPayload({
    ...validPayload,
    name: "Visitor\nBcc",
    subject: "Hello\r\nBcc: victim@example.com"
  });

  assert.ok(result.errors.name);
  assert.ok(result.errors.subject);
});

test("normalizes message line endings, allows tabs, and rejects unsafe controls", () => {
  const accepted = validateContactPayload({ ...validPayload, message: "Line one\r\n\tLine two" });
  const rejected = validateContactPayload({ ...validPayload, message: "Safe text here\u0000hidden" });

  assert.equal(accepted.values.message, "Line one\n\tLine two");
  assert.ok(rejected.errors.message);
});

test("rejects wrong field types and oversized Turnstile or honeypot values", () => {
  const result = validateContactPayload({
    ...validPayload,
    name: ["Visitor"],
    email: 123,
    subject: {},
    message: false,
    turnstileToken: "x".repeat(CONTACT_FIELD_RULES.turnstileToken.max + 1),
    website: "x".repeat(CONTACT_FIELD_RULES.website.max + 1)
  });

  assert.deepEqual(Object.keys(result.errors).sort(), [
    "email",
    "message",
    "name",
    "subject",
    "turnstileToken",
    "website"
  ]);
});
