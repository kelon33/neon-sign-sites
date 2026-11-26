# Neon Sign Sites

We rebuild weak websites of US local service businesses (lawn care, mobile detailing, ...) and offer the new site by email, with a free preview. Owner: Alon (sole proprietor in Israel, עוסק פטור). Store Passport (repo `kelon33/site-translator`) is a separate business: don't touch it from here.

## Offer (keep the site, terms, emails and previews consistent with it)
- **Own it:** $299 one-time. Hosting and SSL included for the first year, then $49/year. Changes $25 each, or $19/month care.
- **Monthly:** $0 to start, $49/month. First month paid at launch, 3-month minimum, then cancel anytime. Up to 2 small edits a month (text, photos, prices, hours). Switch to owning for $299 anytime.

## Repo and publishing
- `site/` is neonsignsites.com (home, terms, privacy, 404). `generator/` builds a customer site from `demos/<slug>/site.json`, with one kit per trade (`kits/detailing.mjs` dark/glossy, `kits/lawn.mjs` bright/green). `pipeline/` goes from a lead to a preview. `leads/` holds lead research.
- **Every push to `main` goes live in about a minute.** Cloudflare Workers Builds runs `node deploy.mjs --dry`, then `npx wrangler deploy` (`wrangler.jsonc`). Previews are at `neonsignsites.com/p/<slug>/`, never indexed (robots.txt, X-Robots-Tag, meta tag).
- `npm test` must pass before pushing.
- The Cloudflare token on the environment (proxy-injected for api.cloudflare.com) has Pages Edit, Account Settings Read and DNS Edit (neonsignsites.com zone). It has **no Workers permissions**: Worker settings and custom domains are done by Alon in the dashboard. Wrangler uploads don't work from a cloud session (the proxy replaces wrangler's upload token), so use git pushes.

## Pipeline
- `npm run lead -- --lead "<name>"` reads their site, picks photos and logo, writes the wording, renders the site and writes `preview.html`, `desktop.jpg`, `phone.jpg`, `email.txt` and `check.txt` in `demos/<slug>/`. `--no-ai` uses the free kit wording; `--fresh` ignores an existing hand-written `site.json` (otherwise its wording is kept).
- The AI wording needs `ANTHROPIC_API_KEY` (an environment variable). The model is `config.json` `aiModel` (Sonnet 5.5, a few cents a lead; Haiku 5.5 is the cheap option). `verify()` drops reviews not on their site word for word and any number not in their site text or Google facts.
- Always look at `desktop.jpg`/`phone.jpg` and `check.txt` before showing a preview to Alon.
- `demos/ericks-auto-detailing` and `demos/lawn-sculptures` are hand-written: don't regenerate their wording.

## Rules that must not break
- **Nothing is sent without Alon's explicit approval of the exact text and link.** Show him each email in full first.
- Previews use only the business's own public content (their website; rating and review count from Google). Never invent reviews, prices, years, guarantees or licences. Never copy Google listing photos or review texts into a site (Google's terms).
- US cold email (CAN-SPAM): our postal address and an opt-out line in every email; honour every "no": add them to `do-not-contact.json` (email, and domain or name) the day they reply; the pipeline refuses any lead on it, and no entry is ever removed. No cold SMS (TCPA).
- Cold email goes from the `.net` (later `.co`) mailboxes, **never from neonsignsites.com**. The .com is the brand: the site, hello@ and alon@ (aliases of alon@neonsignsites.net).
- Start slow: 5 emails a day from alon@neonsignsites.net in the first week, 10 from week 2, more only after the mailboxes are warmed up.
- Google Places API spend stays under about $25 a month in total.
- Never ask for secrets in chat. Never commit secrets. The repo stays private.
- Commit messages end with the attribution lines the session gives.
