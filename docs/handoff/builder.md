# Builder handoff

**Session:** session_019BJDWqGaRxD21UztnejtgL, 2026-11-27 (first handoff; written early, the evening handoff will refresh it).
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
- When Alon picks the AI wording model, the site chats merge into one ("Site & leads"): delete the "list" morning task and fold list.md into site.md.

## Decisions Alon made
- Decent-but-not-perfect sites are pitched too (separate category, email names the gap).
- Sites with too few photos are pitched with the photo pitch, not dropped.
- Soft colours and gradient transitions on every kit; first screen must show headline, buttons and Google rating.
- Realistic licensed photos only (no drawn illustrations) when a business has no photo.

## Watch out
- Wikimedia API and Openverse rate-limit this environment quickly; the Commons MediaSearch web page and thumb.wikimedia.org work. Check each photo's licence on its own file page.
- Node fetch needs NODE_USE_ENV_PROXY=1 in this environment.
- Google review texts shown through widgets (Trustindex) on a business's site must not be copied (site chat added a check).
