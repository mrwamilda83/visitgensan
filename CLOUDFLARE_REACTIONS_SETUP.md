# Cloudflare D1 Guide Reactions Setup

This adds shared live reaction counts for Things To Do guide pages while keeping the site on Cloudflare Pages and Cloudflare's Free plan.

## What was added

- `functions/api/reactions.js` handles `GET` and `POST` requests at `/api/reactions`.
- `migrations/0001_guide_reactions.sql` creates the D1 tables.
- `wrangler.example.toml` shows the required D1 binding.
- `assets/js/main.js` now reads and saves shared reaction totals through the API.

## Later Cloudflare setup

Do not run these steps until the production change is approved.

1. Sign in to the correct Cloudflare account from the project root:

   ```bash
   npx wrangler login
   npx wrangler whoami
   ```

2. Check whether `visitgensan-reactions` already exists. Reuse it if present; otherwise create it once:

   ```bash
   npx wrangler d1 list
   npx wrangler d1 create visitgensan-reactions
   ```

3. Apply the checked-in migration to the remote database:

   ```bash
   npx wrangler d1 migrations apply visitgensan-reactions --remote
   ```

4. In Cloudflare Dashboard, open **Workers & Pages**, select the VisitGenSan Pages project, then open **Settings > Bindings**. Add a **D1 database binding** to the Production environment with these exact values:

   - Variable name: `VISITGENSAN_DB`
   - D1 database: `visitgensan-reactions`

   Add the same binding to Preview only if shared reactions also need to work on preview deployments.

5. Save the binding and redeploy the current production commit so the Pages Function receives it. Do not change DNS, custom domains, or paid-plan settings.

6. Verify the API before testing the buttons:

   ```text
   https://visitgensan.com/api/reactions?page=plaza-heneral-santos.html&visitor=verification-visitor-token-123456
   ```

   A successful response must return HTTP 200 with JSON containing `totals` and `selected`. HTTP 503 means the `VISITGENSAN_DB` binding is still missing from that deployment.

7. Test a reaction in one browser, refresh the page, and then open the same guide in a different browser. The shared total should be identical in both browsers.

## Optional local Wrangler configuration

`wrangler.example.toml` is a template for local Pages development. If it is needed later, copy it to `wrangler.toml` and replace `PASTE_D1_DATABASE_ID_HERE` with the database ID returned by Cloudflare. Do not commit a placeholder configuration.

## Behavior

- Each guide page has separate totals.
- Visitors can submit only one reaction per guide page.
- The first submitted reaction is final and cannot be changed later.
- Counts are shared for all visitors.
- Rapid repeated submissions are rate-limited by the Pages Function.
