# Neon Sign Sites

We rebuild weak websites of US local service businesses (lawn care, mobile detailing, ...) and offer the new site by email, with a free preview. Owner: Alon (sole proprietor in Israel, עוסק פטור). Store Passport (repo `kelon33/site-translator`) is a separate business: don't touch it from here.

## Offer (keep the site, terms, emails and previews consistent with it)
- **Own it:** $299 one-time. Hosting and SSL included for the first year, then $49/year. Changes $25 each, or $19/month care.
- **Monthly:** first month free, then $49/month. Card at signup, first charge on day 31. Minimum 2 paid months after the free month ($98), then cancel anytime; cancelling during the free month costs nothing. One free month per business. The monthly card is the highlighted one on the site. Say "minimum 2 paid months" (never just "2-month minimum") so nobody reads it as 2 months in total. Up to 2 small edits a month (text, photos, prices, hours). Switch to owning for $299 anytime.

## Repo and publishing
- `site/` is neonsignsites.com (home, terms, privacy, 404). `generator/` builds a customer site from `demos/<slug>/site.json`, with one kit per trade (`kits/detailing.mjs` dark/glossy, `kits/lawn.mjs` bright/green). `pipeline/` goes from a lead to a preview. `leads/` holds lead research.
- **Every push to `main` goes live in about a minute.** Cloudflare Workers Builds runs `node deploy.mjs --dry`, then `npx wrangler deploy` (`wrangler.jsonc`). Previews are at `neonsignsites.com/p/<slug>/`, never indexed (robots.txt, X-Robots-Tag, meta tag).
- `npm test` must pass before pushing.
- The Cloudflare token on the environment (proxy-injected for api.cloudflare.com) has Pages Edit, Account Settings Read and DNS Edit (neonsignsites.com zone). It has **no Workers permissions**: Worker settings and custom domains are done by Alon in the dashboard. Wrangler uploads don't work from a cloud session (the proxy replaces wrangler's upload token), so use git pushes.

## Pipeline
- `npm run lead -- --lead "<name>"` reads their site, picks photos and logo, writes the wording, renders the site and writes `preview.html`, `desktop.jpg`, `phone.jpg`, `email.txt` and `check.txt` in `demos/<slug>/`. `--no-ai` uses the free kit wording; `--fresh` ignores an existing hand-written `site.json` (otherwise its wording is kept).
- The AI wording needs `ANTHROPIC_API_KEY` or `NEON_ANTHROPIC_API_KEY` (an environment variable; the cloud environment has the NEON_ one). The model is `config.json` `aiModel` (Sonnet 5.5, a few cents a lead; Haiku 5.5 is the cheap option). `verify()` drops reviews not on their site word for word and any number not in their site text or Google facts.
- Always look at `desktop.jpg`/`phone.jpg` and `check.txt` before showing a preview to Alon.
- `demos/ericks-auto-detailing` and `demos/lawn-sculptures` are hand-written: don't regenerate their wording.

## Launching a customer site
- `npm run launch -- --slug <demo> --domain <their-domain.com>` renders the live version (no preview bar, indexable) into `customers/<domain>/`, registers `www.<domain>` with Cloudflare for SaaS (custom hostnames: 100 free, then $0.10/month each) and writes `connect-email.txt`. `--check` tells whether it's live. A push to `main` publishes it: `deploy.mjs` copies it to `dist/c/<domain>/` and `worker.js` serves it on their domain by Host header.
- The customer adds one CNAME (`www` → `config.json` `customerTarget`) and forwards `<domain>` to `www.<domain>` at their registrar (no apex on Cloudflare's non-Enterprise plans). Their other records, and so their email, are never touched. They choose: do it themselves from the email, or let us do it (delegate access at their registrar, or a screen-share). Never ask for their password. One-click Domain Connect comes later.
- Not set up yet (Alon, in the Cloudflare dashboard): Custom Hostnames on the zone with a fallback origin, the Worker route for customer hosts, `cloudflareZoneId` in `config.json`, and a token with SSL and Certificates Edit reachable from the session.

## Rules that must not break
- **Nothing is sent without Alon's explicit approval of the exact text and link.** Show him each email in full first.
- Previews use only the business's own public content (their website; rating and review count from Google). Never invent reviews, prices, years, guarantees or licences. Never copy Google listing photos or review texts into a site (Google's terms).
- US cold email (CAN-SPAM): our postal address and an opt-out line in every email; honour every "no": add them to `do-not-contact.json` (email, and domain or name) the day they reply; the pipeline refuses any lead on it, and no entry is ever removed. No cold SMS (TCPA).
- Cold email goes from the `.net` (later `.co`) mailboxes, **never from neonsignsites.com**. The .com is the brand: the site, hello@ and alon@ (aliases of alon@neonsignsites.net).
- Start slow: 5 emails a day from alon@neonsignsites.net in the first week, 10 from week 2, more only after the mailboxes are warmed up.
- Google Places API spend stays under about $25 a month in total.
- Never ask for secrets in chat. Never commit secrets. The repo stays private.
- Commit messages end with the attribution lines the session gives.
