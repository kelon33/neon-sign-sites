# Builder handoff

**Session:** session_019BJDWqGaRxD21UztnejtgL (the builder chat, kept every day), 2026-11-27.
**Role:** builds and reviews previews, the kits and the preview design. Environment `neon-sign-sites builder` (open network, no Places key, never sends).

## Done (26-27 Nov)
- Previews built and reviewed for lawn care, mobile detailing, dent repair, Christmas lights, boat detailing, house painting (6 trades, 4 kits: lawn, detailing, painting, holiday).
- Lead search `npm run find` (Text Search only, minimal field mask, monthly cap, `--no-check` / `--check` split across environments, phrases per trade, weak/decent/strong categories, one lead per website, no multi-location branches, `--next` city list).
- `npm run batch`, `npm run queue` (planning only; sending was added on main by the site chat), `npm run wording` (wording library in `wording/`), `npm run fold` (first-screen rule).
- `verify()` drops trust claims their site does not make and AI notes-to-self.
- Photo pitch for sites with too few photos; licensed stock hero per trade (`generator/stock.mjs`, `generator/assets/CREDITS.md`).
- Design: soft tinted backgrounds, gradient transitions, first screen fits on laptop and phones. All 49 previews on main re-rendered and live (ff5110a).

## State
- main is the working branch now; previews go live on push. Branch `claude/previews-batch-2026-11-26` is fully superseded by main except its re-rendered screenshots (not needed): do not merge it.
- Trades in use: lawn care, mobile car detailing, paintless dent repair, Christmas lights, boat detailing, house painting. Testing: RV detailing, sprinkler, stump grinding, sod, pet waste, windshield (existing kits); pressure washing, pool, window cleaning, handyman, junk removal, mobile dog grooming (no kit). Verdicts: handyman and junk removal drop; windshield mostly strong sites; RV borderline.
- Places requests this month: about 41 of 600 at the time of writing (see leads/places-usage.json).

## Open items
- Older previews 602, New Shine and Erick's (hand-written) still say "Shining by tonight" (a promise from the old detailing default). Ask Alon whether to change them (Erick's wording is hand-written).
- Christmas-light leads with real photos: build only those (most have none; photo pitch otherwise). Season ends late December.
- When Alon picks the AI wording model, the site chats merge into one ("Site & leads"): delete the list chat's two scheduled messages (evening save, morning start), fold list.md into site.md, archive the list chat.

## Decisions Alon made
- Decent-but-not-perfect sites are pitched too (separate category, email names the gap).
- Sites with too few photos are pitched with the photo pitch, not dropped.
- Soft colours and gradient transitions on every kit; first screen must show headline, buttons and Google rating.
- Realistic licensed photos only (no drawn illustrations) when a business has no photo.

## Watch out
- Wikimedia API and Openverse rate-limit this environment quickly; the Commons MediaSearch web page and thumb.wikimedia.org work. Check each photo's licence on its own file page.
- Node fetch needs NODE_USE_ENV_PROXY=1 in this environment.
- Google review texts shown through widgets (Trustindex) on a business's site must not be copied (site chat added a check).

## Added by the "20+ more previews" session (session_019BJDWq8M5fSSDziFnSYUbv, 2026-11-27, archived)
Done (all on main):
- 25 of 26 batch previews from found-2026-11-27 reviewed and live (09edbaf), plus 5 from the model comparison (fdc6bfc). Deleted Ocean Wave Painting (no real email).
- Preview bar is one 40px line; it had pushed the phone fold on every preview (46b4567).
- Emails: font-licence addresses (impallari@, ndiscovered.com, latofonts) are ignored by find, and queue, send and batch refuse them; %20 cleaned from mailto links. Cen-Tex Lighting has no real email: never send it (send refuses it).
- `pipeline/checks.mjs` (d8b2447, bc93ff3): Google-review detection, tested on 14 sites (8/8 caught). Also: car vs boat focus, steps-title count, towns out of "also", "customers say" lines. The AI also confirms the logo is theirs (a072308).
- Library-first wording for trades with 8+ reviewed previews; `--model` flag.
- Sending ceiling 30 a mailbox (180 a day from Dec 11); Places cap 3,600 a month (~$125).

Decisions Alon made (2026-11-27):
- AI stays Sonnet 5.5. Compared with Haiku 5.5 on 5 leads: Haiku chose stock photos and dropped real ones on 4 of 5 and wrote an unbacked "Austin's best"; it is ~14x cheaper (0.25¢ against ~3.5¢).
- **Approved: move the AI step to the Message Batches API (50% off)**, so Sonnet at 180 a day (~$190/month) fits his $100/month of free API credits. Needed before about Dec 6 (~90 previews a day).
- Places budget about $125 a month; ceiling 30 a day per mailbox.

Open item: build the Batches switch (not started; no code changed). Plan:
1. `copy.mjs`: split `sharpen()` into `sharpenRequest()` (returns params and facts), a direct call (keeps the beta `fallbacks`), and `parseSharpen(message, facts)`. Batch requests can't carry `fallbacks` or `betas`: use `client.messages.batches.create({ requests: [{ custom_id, params }] })` with plain params (output_config json_schema plus effort work there).
2. `cli.mjs --prepare`: run up to the AI call, then write `demos/<slug>/.build.json` (lead, checks, copy, photos, logo, heroIndex, order, wordmark, libFirst, model, text, site.pages incl. raw/rendered) and `.ai-request.json`, and exit. `--finish`: load them plus `.ai-result.json`, continue from the merge step (checks, gallery, render, screenshots, email), delete the three files. Add them to .gitignore.
3. `batch.mjs`: prepare all, submit one batch (custom_id p0..pN mapped to slugs, saved in leads/ai-batches.json so a dead session can resume with `--resume <batch id>`), poll every minute (most finish within 1h, max 24h), write results, finish each. `builtAlready()` must count a demos dir only when it has site.json. Keep `npm run lead` (direct call) for single leads.
4. Prices: batch is half of $2/$10 (Sonnet 5.5) per million tokens.

Lead supply (Saturday 28 Nov):
- 12 buildable leads left in found-2026-11-27.json (15 minus the 5 built, plus 2 now eligible).
- 41 of the month's 3,600 Places requests used.
- 36 previews ready and not yet emailed (one is Cen-Tex Lighting, which can't be sent).
- The ramp needs 30 Sat, 42 Sun, 54 Mon, then +12 a day to 180 on Dec 11. Searching more cities is urgent (site chat). Yield is about 2 emailable leads per Places request; boat, dent and painting do best, big-city lawn and car detailing worst.

Known gaps (not fixed):
- When the logo is wrong, the real logo is often among their photos (the AI says which). Could be used automatically.
- The detailing booking form asks "Where should we come?" even for shops.
- Google's phone number can be a call-tracking line different from their site's; their site's number is better.
- Hours like "Open 24 hours" come from their sites; drop them in review.
