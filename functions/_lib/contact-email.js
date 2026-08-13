const APPS_SCRIPT_HOSTNAME = "script.google.com";
const APPS_SCRIPT_PATH_PATTERN = /^\/macros\/s\/[^/]+\/exec$/u;
const DELIVERY_TIMEOUT_MS = 10000;
const SAFE_PROVIDER_ERROR_EVENTS = Object.freeze({
  UNAUTHORIZED: "apps_script_unauthorized",
  VALIDATION_ERROR: "apps_script_validation_failure",
  INVALID_REQUEST: "apps_script_invalid_request",
  SEND_FAILED: "apps_script_send_failure"
});

function logProviderDiagnostic(logger, event, startedAt, details = {}) {
  try {
    logger?.info?.(JSON.stringify({
      scope: "contact_delivery",
      event,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      ...details
    }));
  } catch (error) {
    // Diagnostics must never interrupt contact delivery.
  }
}

function isAllowedAppsScriptUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === APPS_SCRIPT_HOSTNAME &&
      APPS_SCRIPT_PATH_PATTERN.test(url.pathname) &&
      !url.username &&
      !url.password;
  } catch (error) {
    return false;
  }
}

function isSuccessfulProviderPayload(payload) {
  return payload && typeof payload === "object" && !Array.isArray(payload) &&
    (payload.ok === true || payload.success === true);
}

function getProviderFailureEvent(payload) {
  const providerCode = typeof payload?.code === "string"
    ? payload.code.trim().toUpperCase()
    : "";
  return SAFE_PROVIDER_ERROR_EVENTS[providerCode] || "apps_script_rejected";
}

export async function forwardContactToAppsScript(values, env, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const logger = options.logger || console;
  const endpoint = env?.APPS_SCRIPT_CONTACT_URL;
  const sharedSecret = env?.CONTACT_SHARED_SECRET;
  const startedAt = Date.now();

  if (!sharedSecret || !isAllowedAppsScriptUrl(endpoint)) {
    logProviderDiagnostic(logger, "apps_script_configuration_failure", startedAt);
    return { ok: false, retryable: true };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || DELIVERY_TIMEOUT_MS);
  logProviderDiagnostic(logger, "apps_script_request_started", startedAt);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({
        sharedSecret,
        name: values.name,
        email: values.email,
        subject: values.subject,
        message: values.message
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      logProviderDiagnostic(logger, "apps_script_http_failure", startedAt, {
        httpStatusClass: Math.floor(response.status / 100)
      });
      return { ok: false, retryable: response.status >= 500 || response.status === 429 };
    }

    let payload;
    try {
      payload = JSON.parse(await response.text());
    } catch (error) {
      logProviderDiagnostic(logger, "apps_script_non_json_response", startedAt);
      return { ok: false, retryable: true };
    }

    if (isSuccessfulProviderPayload(payload)) {
      logProviderDiagnostic(logger, "apps_script_success", startedAt);
      return { ok: true, retryable: false };
    }

    logProviderDiagnostic(logger, getProviderFailureEvent(payload), startedAt);
    return { ok: false, retryable: false };
  } catch (error) {
    logProviderDiagnostic(
      logger,
      controller.signal.aborted ? "apps_script_timeout" : "apps_script_network_failure",
      startedAt
    );
    return { ok: false, retryable: true };
  } finally {
    clearTimeout(timeoutId);
  }
}
