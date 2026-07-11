# Cloudflare D1 Guide Reactions Setup

This adds shared live reaction counts for Things To Do guide pages while keeping the site on Cloudflare Pages and Cloudflare's Free plan.

## What was added

- `functions/api/reactions.js` handles `GET` and `POST` requests at `/api/reactions`.
- `migrations/0001_guide_reactions.sql` creates the D1 tables.
- `wrangler.example.toml` shows the required D1 binding.
- `assets/js/main.js` now reads and saves shared reaction totals through the API.

## One-time Cloudflare setup

Run these from the project root after installing or using Wrangler.

```bash
npx wrangler d1 create visitgensan-reactions
```

Cloudflare will print a `database_id`. Copy `wrangler.example.toml` to `wrangler.toml`, then replace `PASTE_D1_DATABASE_ID_HERE` with that ID.

```bash
copy wrangler.example.toml wrangler.toml
npx wrangler d1 migrations apply visitgensan-reactions --remote
```

## Cloudflare Pages binding

In Cloudflare Pages, make sure the production environment has this D1 binding:

- Binding name: `VISITGENSAN_DB`
- Database: `visitgensan-reactions`

Do not change DNS, custom domains, or paid plan settings.

## Deploy

Commit and push to GitHub `main`. Cloudflare Pages will deploy automatically.

## Behavior

- Each guide page has separate totals.
- Visitors can select one reaction per guide page.
- Visitors can change their reaction later.
- Counts are shared for all visitors.
- Rapid repeated changes are rate-limited by the Pages Function.
