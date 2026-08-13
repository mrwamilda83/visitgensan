# Secure Contact Form Setup

The Contact Us implementation uses a same-origin Cloudflare Pages Function, Cloudflare Turnstile, temporary D1 abuse-control records, and a private Google Apps Script delivery endpoint.

## Required production bindings and secrets

The Pages Production environment must provide:

- `VISITGENSAN_DB` as the existing D1 binding.
- `APPS_SCRIPT_CONTACT_URL` as an encrypted secret.
- `CONTACT_SHARED_SECRET` as an encrypted secret.
- `TURNSTILE_SECRET_KEY` as an encrypted secret.
- `CONTACT_RATE_LIMIT_PEPPER` as an encrypted secret.

Do not put secret values in this repository, `wrangler.jsonc`, HTML, browser JavaScript, or public data files.

## D1 migration

Do not apply the migration until the change has been reviewed and approved. From the project root, confirm the active Cloudflare account and then apply the checked-in migration:

```bash
npx wrangler whoami
npx wrangler d1 migrations apply visitgensan-reactions --remote
```

The migration creates only `contact_abuse_records`. It stores keyed identifiers, record types, counters, time windows, and expiry timestamps. It does not store contact names, email addresses, subjects, messages, raw IP addresses, Turnstile tokens, provider secrets, or the recipient address.

## Deployment order

1. Review and approve the local diff and tests.
2. Confirm the four encrypted Production secrets and the `VISITGENSAN_DB` binding.
3. Confirm the Turnstile widget allows `visitgensan.com` and any production hostname that serves the form, with action `contact`.
4. Confirm the Google Apps Script accepts JSON containing `sharedSecret`, `name`, `email`, `subject`, and `message`, and returns JSON with `ok: true` or `success: true` only after Gmail accepts the message.
5. Apply the D1 migration using the command above.
6. Deploy the approved site change.
7. Test one legitimate message and confirm generic behavior for invalid Turnstile, rate limiting, and provider failure.

Preview deployments should use dedicated test credentials or keep real delivery disabled so that local and automated testing cannot send production email.
