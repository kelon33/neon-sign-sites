# Neon Sign Sites

Modern websites for US local service businesses, offered by email with a free preview.

| Folder | What it is |
| --- | --- |
| `site/` | neonsignsites.com (home, terms, privacy) |
| `generator/` | Builds a customer site from `site.json`; one kit per trade (`kits/lawn.mjs`, `kits/detailing.mjs`) |
| `pipeline/` | `npm run lead -- --lead "<name>"`: their site → photos, wording, preview, email draft, check list |
| `demos/<slug>/` | Previews, published at `neonsignsites.com/p/<slug>/` (never indexed) |
| `leads/` | Lead research (Google Places): `npm run find -- --trade lawn --city "Austin, TX"` (budget-capped, see CLAUDE.md) |

Publishing: Cloudflare Workers Builds runs `node deploy.mjs --dry` and `npx wrangler deploy` on every push to `main`; `wrangler.jsonc` serves `dist/` as static files.

Rules: previews use only the business's own public content (no invented reviews, prices or claims); every email is approved by a person before it is sent; email has a postal address and an opt-out.
