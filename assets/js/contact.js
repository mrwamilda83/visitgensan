import {
  CONTACT_FIELD_RULES,
  validateContactPayload
} from "./contact-validation.js";

const CONTACT_API_PATH = "/api/contact";
const CONTACT_REQUEST_TIMEOUT_MS = 20000;
const CONTACT_PUBLIC_CONFIG = Object.freeze({
  turnstileSiteKey: "0x4AAAAAAEOpSGmncMtxmSyJ",
  localTurnstileSiteKey: "1x00000000000000000000AA"
});
const CONTACT_TOPIC_SUBJECTS = Object.freeze({
  listing: "Business listing inquiry",
  correction: "Website correction",
  business: "Business inquiry"
});

const form = document.querySelector("[data-contact-form]");

if (form) {
  const submitButton = form.querySelector("[type='submit']");
  const status = document.querySelector("[data-contact-status]");
  const fields = {
    name: form.elements.name,
    email: form.elements.email,
    subject: form.elements.subject,
    message: form.elements.message
  };
  let isSubmitting = false;
  let turnstileWidgetId = null;

  for (const [fieldName, field] of Object.entries(fields)) {
    field.minLength = CONTACT_FIELD_RULES[fieldName].min;
    field.maxLength = CONTACT_FIELD_RULES[fieldName].max;
    field.addEventListener("input", () => clearFieldError(fieldName));
  }

  const topic = new URLSearchParams(window.location.search).get("topic");
  if (!fields.subject.value && Object.hasOwn(CONTACT_TOPIC_SUBJECTS, topic)) {
    fields.subject.value = CONTACT_TOPIC_SUBJECTS[topic];
  }

  function getFieldErrorElement(fieldName) {
    return document.querySelector(`[data-error-for='${fieldName}']`);
  }

  function clearFieldError(fieldName) {
    const field = fields[fieldName];
    const errorElement = getFieldErrorElement(fieldName);
    field?.removeAttribute("aria-invalid");
    if (errorElement) errorElement.textContent = "";
  }

  function clearAllErrors() {
    Object.keys(fields).forEach(clearFieldError);
    const turnstileError = getFieldErrorElement("turnstileToken");
    if (turnstileError) turnstileError.textContent = "";
  }

  function showStatus(message, state = "") {
    status.textContent = message;
    status.dataset.state = state;
  }

  function setFieldErrors(errors) {
    let firstInvalidField = null;

    for (const [fieldName, message] of Object.entries(errors || {})) {
      const errorElement = getFieldErrorElement(fieldName);
      if (errorElement) errorElement.textContent = String(message);

      const field = fields[fieldName];
      if (field) {
        field.setAttribute("aria-invalid", "true");
        firstInvalidField ||= field;
      }
    }

    if (firstInvalidField) {
      firstInvalidField.focus();
    } else if (errors?.turnstileToken) {
      document.querySelector(".contact-turnstile")?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function getTurnstileToken() {
    return String(form.querySelector("[name='cf-turnstile-response']")?.value || "").trim();
  }

  function resetTurnstile() {
    if (
      turnstileWidgetId !== null &&
      window.turnstile &&
      typeof window.turnstile.reset === "function"
    ) {
      window.turnstile.reset(turnstileWidgetId);
    }
  }

  function initializeTurnstile() {
    if (turnstileWidgetId !== null || !window.turnstile || typeof window.turnstile.render !== "function") {
      return;
    }

    const localHosts = new Set(["localhost", "127.0.0.1"]);
    const sitekey = localHosts.has(window.location.hostname)
      ? CONTACT_PUBLIC_CONFIG.localTurnstileSiteKey
      : CONTACT_PUBLIC_CONFIG.turnstileSiteKey;

    turnstileWidgetId = window.turnstile.render("#contact-turnstile-widget", {
      sitekey,
      action: "contact",
      size: "flexible",
      theme: "light",
      callback: () => {
        const errorElement = getFieldErrorElement("turnstileToken");
        if (errorElement) errorElement.textContent = "";
      },
      "expired-callback": () => {
        const errorElement = getFieldErrorElement("turnstileToken");
        if (errorElement) errorElement.textContent = "The security check expired. Please try again.";
      },
      "error-callback": () => {
        const errorElement = getFieldErrorElement("turnstileToken");
        if (errorElement) errorElement.textContent = "The security check could not load. Please try again.";
      }
    });
  }

  if (document.readyState === "complete") {
    initializeTurnstile();
  } else {
    window.addEventListener("load", initializeTurnstile, { once: true });
  }

  document.querySelector("[data-turnstile-script]")?.addEventListener("error", () => {
    const errorElement = getFieldErrorElement("turnstileToken");
    if (errorElement) errorElement.textContent = "The security check could not load. Please refresh and try again.";
  });

  function setSubmitting(submitting) {
    isSubmitting = submitting;
    submitButton.disabled = submitting;
    form.setAttribute("aria-busy", String(submitting));
    submitButton.textContent = submitting ? "Sending…" : "Send Message";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    clearAllErrors();
    showStatus("");

    const input = {
      name: fields.name.value,
      email: fields.email.value,
      subject: fields.subject.value,
      message: fields.message.value
    };
    const validation = validateContactPayload(input, { includeTurnstile: false });
    const turnstileToken = getTurnstileToken();

    if (!turnstileToken) {
      validation.errors.turnstileToken = "Complete the security check.";
      validation.valid = false;
    }

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      showStatus("Check the highlighted fields and try again.", "error");
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CONTACT_REQUEST_TIMEOUT_MS);
    setSubmitting(true);
    showStatus("Sending your message…", "pending");

    try {
      const response = await fetch(CONTACT_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...validation.values,
          turnstileToken,
          website: String(form.elements.website.value || "")
        }),
        signal: controller.signal
      });

      let result;
      try {
        result = await response.json();
      } catch (error) {
        result = null;
      }

      if (!response.ok || result?.ok !== true) {
        if (result?.code === "VALIDATION_ERROR" && result.errors) {
          setFieldErrors(result.errors);
        }
        if (result?.code === "VERIFICATION_FAILED" || result?.code === "VERIFICATION_UNAVAILABLE") {
          setFieldErrors({ turnstileToken: result.message || "Complete the security check and try again." });
        }
        showStatus(
          typeof result?.message === "string"
            ? result.message
            : "We could not send your message right now. Please try again later.",
          "error"
        );
        resetTurnstile();
        return;
      }

      form.reset();
      resetTurnstile();
      showStatus("Your message has been sent.", "success");
      status.focus();
    } catch (error) {
      showStatus("We could not send your message right now. Please try again later.", "error");
      resetTurnstile();
    } finally {
      window.clearTimeout(timeoutId);
      setSubmitting(false);
    }
  });
}
