const APPS_SCRIPT_HOSTNAME = "script.google.com";
const APPS_SCRIPT_PATH_PATTERN = /^\/macros\/s\/[^/]+\/exec$/u;
const DELIVERY_TIMEOUT_MS = 10000;

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

export async function forwardContactToAppsScript(values, env, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const endpoint = env?.APPS_SCRIPT_CONTACT_URL;
  const sharedSecret = env?.CONTACT_SHARED_SECRET;

  if (!sharedSecret || !isAllowedAppsScriptUrl(endpoint)) {
    return { ok: false, retryable: true };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || DELIVERY_TIMEOUT_MS);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({
        secret: sharedSecret,
        name: values.name,
        email: values.email,
        subject: values.subject,
        message: values.message
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      return { ok: false, retryable: response.status >= 500 || response.status === 429 };
    }

    let payload;
    try {
      payload = JSON.parse(await response.text());
    } catch (error) {
      return { ok: false, retryable: true };
    }

    return isSuccessfulProviderPayload(payload)
      ? { ok: true, retryable: false }
      : { ok: false, retryable: false };
  } catch (error) {
    return { ok: false, retryable: true };
  } finally {
    clearTimeout(timeoutId);
  }
}
