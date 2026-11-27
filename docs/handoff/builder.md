# Builder handoff

**Session:** session_019BJDWqGaRxD21UztnejtgL (the builder chat, kept every day), saved 2026-11-27 evening.
**Role:** builds and reviews previews, the kits and the preview design. Environment `neon-sign-sites builder` (open network, no Places key, never sends).

## Done today (27 Nov)
- **Message Batches switch** (69c64c8): `cli.mjs --prepare` / `--finish <slug>`, `batch.mjs` submits one batch, polls, finishes each; `--resume <batch id>` (ids in `leads/ai-batches.json`), `--direct` for the old path. Half price: Sonnet about 1.7¢ a preview.
- **Model test** Sonnet vs Opus on 10 leads (8acda0e, `docs/handoff/model-test-2026-11-27.md`): keep Sonnet.
- **Wording library** no longer reuses lines naming other businesses' people or places (`strangeNames()` in wording.mjs).
- **Chains** applied in `batch.mjs pick()`; added collision/painting franchises, That 1 Painter, Southern Painting.
- **"Shining by tonight"** replaced in 602, New Shine and Erick's (898aa15).
- **Big batch:** 85 built through one Message Batch; reviewed with `npm run review`; 78 live (35c8b1f), 7 rejected (`leads/rejected.json`), 3 car washes relabelled from "Boat detailing" by hand. Wording library updated (c550880).
- **JUNK_EMAIL** also drops `@doe.com`, `unsubscribe*@`, `@constantcontact.`, and any address with characters an email can't have.
- **Rules added to CLAUDE.md:** spend Claude usage carefully (83da612); when to notify Alon (631516f; exceptions kept: prospect replies and the nightly /clear message); every hand fix becomes a script fix, logged in `docs/review-lessons.md` (e593c29).
- `npm run review`: contact sheets (6 previews each, first screen desktop + phone) and `review/digest.md`.

## State
- About **113 previews ready** and not emailed (35 earlier + 78 today). Site chat told.
- `leads/found-2026-11-27.json`: **24 buildable leads left** (`--dry`), about 60¢ batched. 4 of them failed today and need a rebuild: Preferred Hail Group (my git stash), Dent Concepts, High End Auto Detailing, Immaculate Auto Detailing (images that can't be decoded).
- Places: 84 requests this month (cap 3,600).

## Open items (builder)
1. **Script fixes from today's review** (`docs/review-lessons.md`, all "open"):
   - AI answer gets a `fit` field (does the business do this trade itself?); `fit: false` skips the preview.
   - Choose the trade label (kicker, title, footer, headline) from their services: mostly cars → car wording even on a "boat" lead.
   - Skip an image that fails to decode instead of failing the build.
   - Claude's note saying "franchise" rejects the preview automatically.
   - Cut a mangled email at the first bad character instead of dropping it.
2. Then rebuild the 24 leads left: `npm run batch -- --file leads/found-2026-11-27.json --count 24`, review with `npm run review`, log lessons.
3. 4-photo gallery leaves an empty slot bottom-right (seen on Exclusive Auto Detailing).
4. Ideas Alon agreed to (sending side, site chat or here): one polite follow-up 4-5 days later in the approval list; check each address before sending and pause a mailbox when bounces climb; replies by trade and pitch on the dashboard; a bigger "Make it live" with both prices on previews.
5. When Alon finishes choosing the model: merge the list chat into site (delete trig_018TtMr6QoNoMobgHe7xqXbj and trig_01J3eaomigRNA6eEWRgSg56t, fold list.md into site.md, archive the list chat).

## Decisions Alon made today
- One chat per role, cleared nightly by Alon after the save (no new chat each day).
- Keep Sonnet 5.5 through Batches.
- Notify him only for the daily sending approval, prospect replies, the nightly save, or when he is working in the chat.
- Every hand fix in a review becomes a script fix.

## Watch out
- **Never `git stash -u` while a batch runs**: it removes the in-progress `demos/` folders.
- `render.mjs` takes `demos/<slug>/site.json` and rewrites index.html only; `preview.html` (inlined single file) and the screenshots stay old. Patch preview.html or rebuild with `--finish`.
- Push from the worktree with `git push origin HEAD:main`; if main moved and the tree is busy, cherry-pick in a temporary worktree.
- Node fetch needs NODE_USE_ENV_PROXY=1.
- Never copy Google review texts (Trustindex widgets on their sites) into a preview.
- Known gaps: wrong logo is often among their photos; booking form asks "Where should we come?" for shops; Google's phone can be a tracking line; "Open 24 hours" hours.
