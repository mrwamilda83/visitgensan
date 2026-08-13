export const CONTACT_FIELD_RULES = Object.freeze({
  name: Object.freeze({ min: 2, max: 100 }),
  email: Object.freeze({ min: 3, max: 254, localMax: 64, domainMax: 253 }),
  subject: Object.freeze({ min: 3, max: 150 }),
  message: Object.freeze({ min: 10, max: 5000 }),
  turnstileToken: Object.freeze({ min: 1, max: 2048 }),
  website: Object.freeze({ min: 0, max: 200 })
});

export const CONTACT_REQUEST_KEYS = Object.freeze([
  "name",
  "email",
  "subject",
  "message",
  "turnstileToken",
  "website"
]);

const SINGLE_LINE_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const MESSAGE_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const EMAIL_WHITESPACE_PATTERN = /[\s\p{Zs}]/u;
const EMAIL_LOCAL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;
const DOMAIN_LABEL_PATTERN = /^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?$/i;

export function countCodePoints(value) {
  return Array.from(value).length;
}

function normalizeSingleLine(value) {
  return value.normalize("NFC").trim().replace(/[\p{Zs} ]+/gu, " ");
}

function normalizeMessage(value) {
  return value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
}

function validateName(value) {
  if (typeof value !== "string") {
    return { error: "Enter your name." };
  }

  if (SINGLE_LINE_CONTROL_PATTERN.test(value)) {
    return { error: "Enter a valid name without control characters." };
  }

  const normalized = normalizeSingleLine(value);
  const length = countCodePoints(normalized);

  if (length < CONTACT_FIELD_RULES.name.min) {
    return { error: "Enter a name with at least 2 characters." };
  }

  if (length > CONTACT_FIELD_RULES.name.max) {
    return { error: "Keep your name to 100 characters or fewer." };
  }

  return { value: normalized };
}

function validateEmail(value) {
  if (typeof value !== "string") {
    return { error: "Enter your email address." };
  }

  if (SINGLE_LINE_CONTROL_PATTERN.test(value)) {
    return { error: "Enter a valid email address." };
  }

  const normalized = value.normalize("NFC").trim();

  if (EMAIL_WHITESPACE_PATTERN.test(normalized)) {
    return { error: "Enter a valid email address." };
  }

  const atIndex = normalized.lastIndexOf("@");
  const firstAtIndex = normalized.indexOf("@");

  if (
    countCodePoints(normalized) < CONTACT_FIELD_RULES.email.min ||
    countCodePoints(normalized) > CONTACT_FIELD_RULES.email.max ||
    atIndex <= 0 ||
    atIndex !== firstAtIndex ||
    atIndex === normalized.length - 1
  ) {
    return { error: "Enter a valid email address." };
  }

  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const labels = domain.split(".");

  if (
    countCodePoints(localPart) > CONTACT_FIELD_RULES.email.localMax ||
    countCodePoints(domain) > CONTACT_FIELD_RULES.email.domainMax ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !EMAIL_LOCAL_PATTERN.test(localPart) ||
    labels.length < 2 ||
    labels.some((label) => !DOMAIN_LABEL_PATTERN.test(label))
  ) {
    return { error: "Enter a valid email address." };
  }

  return { value: `${localPart}@${domain.toLocaleLowerCase("en-US")}` };
}

function validateSubject(value) {
  if (typeof value !== "string") {
    return { error: "Enter a subject." };
  }

  if (SINGLE_LINE_CONTROL_PATTERN.test(value)) {
    return { error: "Enter a valid subject without line breaks or control characters." };
  }

  const normalized = normalizeSingleLine(value);
  const length = countCodePoints(normalized);

  if (length < CONTACT_FIELD_RULES.subject.min) {
    return { error: "Enter a subject with at least 3 characters." };
  }

  if (length > CONTACT_FIELD_RULES.subject.max) {
    return { error: "Keep the subject to 150 characters or fewer." };
  }

  return { value: normalized };
}

function validateMessage(value) {
  if (typeof value !== "string") {
    return { error: "Enter your message." };
  }

  const normalizedLineEndings = value.replace(/\r\n?/gu, "\n");

  if (MESSAGE_CONTROL_PATTERN.test(normalizedLineEndings)) {
    return { error: "Remove unsupported control characters from your message." };
  }

  const normalized = normalizeMessage(normalizedLineEndings);
  const length = countCodePoints(normalized);

  if (length < CONTACT_FIELD_RULES.message.min) {
    return { error: "Enter a message with at least 10 characters." };
  }

  if (length > CONTACT_FIELD_RULES.message.max) {
    return { error: "Keep your message to 5,000 characters or fewer." };
  }

  return { value: normalized };
}

function validateTurnstileToken(value) {
  if (typeof value !== "string") {
    return { error: "Complete the security check." };
  }

  const normalized = value.trim();

  if (
    countCodePoints(normalized) < CONTACT_FIELD_RULES.turnstileToken.min ||
    countCodePoints(normalized) > CONTACT_FIELD_RULES.turnstileToken.max ||
    SINGLE_LINE_CONTROL_PATTERN.test(normalized)
  ) {
    return { error: "Complete the security check." };
  }

  return { value: normalized };
}

function validateHoneypot(value) {
  if (value === undefined) {
    return { value: "" };
  }

  if (typeof value !== "string" || countCodePoints(value) > CONTACT_FIELD_RULES.website.max) {
    return { error: "The request contains invalid form data." };
  }

  return { value: value.trim() };
}

const FIELD_VALIDATORS = Object.freeze({
  name: validateName,
  email: validateEmail,
  subject: validateSubject,
  message: validateMessage,
  turnstileToken: validateTurnstileToken,
  website: validateHoneypot
});

export function validateContactPayload(payload, options = {}) {
  const includeTurnstile = options.includeTurnstile !== false;
  const fields = includeTurnstile
    ? CONTACT_REQUEST_KEYS
    : CONTACT_REQUEST_KEYS.filter((field) => field !== "turnstileToken" && field !== "website");
  const errors = {};
  const values = {};

  for (const field of fields) {
    const result = FIELD_VALIDATORS[field](payload?.[field]);
    if (result.error) {
      errors[field] = result.error;
    } else {
      values[field] = result.value;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    values
  };
}
