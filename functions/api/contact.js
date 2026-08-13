import {
  CONTACT_REQUEST_KEYS,
  validateContactPayload
} from "../../assets/js/contact-validation.js";
import {
  buildContactDuplicateKey,
  buildContactIdentityKey,
  enforceContactRateLimit,
  getTrustedClientIp,
  releaseContactDuplicate,
  reserveContactDuplicate
} from "../_lib/contact-abuse.js";
import { forwardContactToAppsScript } from "../_lib/contact-email.js";

export const CONTACT_MAX_BODY_BYTES = 32 * 1024;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ACTION = "contact";
const TURNSTILE_TIMEOUT_MS = 8000;

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

function successResponse() {
  return jsonResponse({ ok: true, message: "Your message has been sent." });
}

function errorResponse(code, message, status, extra = {}, headers = {}) {
  return jsonResponse({ ok: false, code, message, ...extra }, status, headers);
}

function getContentType(request) {
  return (request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
}

function hasAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

function hasOnlyExpectedKeys(payload) {
  const allowedKeys = new Set(CONTACT_REQUEST_KEYS);
  return Object.keys(payload).every((key) => allowedKeys.has(key));
}

export async function readJsonBodyWithLimit(request, maxBytes = CONTACT_MAX_BODY_BYTES) {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength && Number.isFinite(Number(contentLength)) && Number(contentLength) > maxBytes) {
    return { ok: false, tooLarge: true };
  }

  if (!request.body) {
    return { ok: false, malformed: true };
  }

  const reader = request.body.getReader();
  const chunks = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel();
      return { ok: false, tooLarge: true };
    }
    chunks.push(value);
  }

  const bodyBytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const bodyText = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
    return { ok: true, payload: JSON.parse(bodyText) };
  } catch (error) {
    return { ok: false, malformed: true };
  }
}

export async function verifyTurnstileToken({ token, secret, clientIp, hostname, fetchImpl = fetch }) {
  if (!secret) {
    return { valid: false, unavailable: true };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);

  try {
    const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: clientIp
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      return { valid: false, unavailable: response.status >= 500 || response.status === 429 };
    }

    let result;
    try {
      result = await response.json();
    } catch (error) {
      return { valid: false, unavailable: true };
    }

    return {
      valid: result?.success === true &&
        String(result.hostname || "").toLowerCase() === hostname.toLowerCase() &&
        result.action === TURNSTILE_ACTION,
      unavailable: false
    };
  } catch (error) {
    return { valid: false, unavailable: true };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createContactHandler(overrides = {}) {
  const now = overrides.now || (() => Date.now());
  const rateLimit = overrides.enforceRateLimit || enforceContactRateLimit;
  const reserveDuplicate = overrides.reserveDuplicate || reserveContactDuplicate;
  const releaseDuplicate = overrides.releaseDuplicate || releaseContactDuplicate;
  const verifyTurnstile = overrides.verifyTurnstile || verifyTurnstileToken;
  const forwardContact = overrides.forwardContact || forwardContactToAppsScript;
  const fetchImpl = overrides.fetchImpl || fetch;

  return async function handleContactRequest(context) {
    const { request, env } = context;

    if (request.method !== "POST") {
      return errorResponse("METHOD_NOT_ALLOWED", "Method not allowed.", 405, {}, { allow: "POST" });
    }

    if (getContentType(request) !== "application/json") {
      return errorResponse("UNSUPPORTED_MEDIA_TYPE", "Send the form as JSON.", 415);
    }

    if (!hasAllowedOrigin(request)) {
      return errorResponse("INVALID_REQUEST", "The request could not be accepted.", 403);
    }

    const parsedBody = await readJsonBodyWithLimit(request);
    if (parsedBody.tooLarge) {
      return errorResponse("REQUEST_TOO_LARGE", "The request is too large.", 413);
    }

    if (!parsedBody.ok) {
      return errorResponse("INVALID_REQUEST", "The request contains malformed JSON.", 400);
    }

    const payload = parsedBody.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || !hasOnlyExpectedKeys(payload)) {
      return errorResponse("INVALID_REQUEST", "The request contains unexpected form data.", 400);
    }

    const validation = validateContactPayload(payload);
    if (!validation.valid) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Check the highlighted fields and try again.",
        400,
        { errors: validation.errors }
      );
    }

    if (validation.values.website) {
      return successResponse();
    }

    const db = env?.VISITGENSAN_DB;
    const pepper = env?.CONTACT_RATE_LIMIT_PEPPER;
    if (!db || !pepper) {
      return errorResponse(
        "SERVICE_UNAVAILABLE",
        "We could not send your message right now. Please try again later.",
        503
      );
    }

    try {
      const identityKey = await buildContactIdentityKey(request, pepper);
      const rateLimitResult = await rateLimit(db, identityKey, now());

      if (rateLimitResult.limited) {
        return errorResponse(
          "RATE_LIMITED",
          "Please wait before sending another message.",
          429,
          {},
          { "retry-after": String(rateLimitResult.retryAfterSeconds) }
        );
      }

      const requestUrl = new URL(request.url);
      const turnstileResult = await verifyTurnstile({
        token: validation.values.turnstileToken,
        secret: env.TURNSTILE_SECRET_KEY,
        clientIp: getTrustedClientIp(request),
        hostname: requestUrl.hostname,
        fetchImpl
      });

      if (!turnstileResult.valid) {
        const status = turnstileResult.unavailable ? 503 : 403;
        const code = turnstileResult.unavailable ? "VERIFICATION_UNAVAILABLE" : "VERIFICATION_FAILED";
        const message = turnstileResult.unavailable
          ? "The security check is temporarily unavailable. Please try again."
          : "Complete the security check and try again.";
        return errorResponse(code, message, status);
      }

      const duplicateKey = await buildContactDuplicateKey(validation.values, identityKey, pepper);
      const reserved = await reserveDuplicate(db, duplicateKey, now());
      if (!reserved) {
        return successResponse();
      }

      const delivery = await forwardContact(validation.values, env, { fetchImpl });
      if (!delivery.ok) {
        await releaseDuplicate(db, duplicateKey);
        return errorResponse(
          "SEND_FAILED",
          "We could not send your message right now. Please try again later.",
          delivery.retryable ? 503 : 502
        );
      }

      return successResponse();
    } catch (error) {
      return errorResponse(
        "SERVICE_UNAVAILABLE",
        "We could not send your message right now. Please try again later.",
        503
      );
    }
  };
}

const handleContactRequest = createContactHandler();

export async function onRequest(context) {
  return handleContactRequest(context);
}
