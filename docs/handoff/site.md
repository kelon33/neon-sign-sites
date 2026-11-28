# Site & leads chat: handoff

**Session:** session_019BJDWt9JCprr2AY2pf56w7 · 2026-11-27 (Friday)

## Done today
- **First cold emails:** 18 sent, 3 per mailbox (6 boxes). 9 in the old wording (2 before the PayPal hold, 7 before the wording stop), 9 in the new wording with the subject A/B test (5 A, 4 B). 1 bounce (Auto Hail Solutions).
- **Sending pipeline:** `npm run send` (Gmail API, bulk approval, re-checks every rule), local 8:00 window per business time zone (`pipeline/timing.mjs`), six mailboxes in parallel (8335bab), Instantly ramp 3 then +2 a day, every day, up to 30 per box (CLAUDE.md).
- **Email wording** agreed with Alon (5b83348): short, one question, call line, `compose()`; subject A/B test.
- **Replies:** `npm run replies` (inbox + spam, other addresses, bounces, site forms), `npm run answer` (Alon's approved answer in the same thread).
- **Site:** postal address and phone in the footer; small edit defined in the terms/FAQ; sections fade in and out both ways; blended section backgrounds; tighter spacing; phone bottom bar (free preview + call); trades strip = trades we pitch (f44352a).
- **Payments:** Own it → PayPal link; Monthly → `/subscribe` (PayPal subscription buttons, plan P-37K09329B1018204CNMEYMFY, slug as custom_id).
- **Dashboard** neonsignsites.com/dashboard (Access login): hot/warm/cold, every business with its preview link, emails per day, subject test, Calls box (Quo webhook, missed calls highlighted, ringing too), revenue (PayPal webhook), webhook status lines, Israel time (429433d). Alon's own visits never count (`?me=1`, cookie).
- **Leads:** boat/dent/painting in San Antonio, Jacksonville, Nashville, Las Vegas: 247 new (443ce07). workers.dev and preview URLs off (a85ae07).

## State
- **Live on main:** everything above. 116 reviewed previews ready and not emailed (builder batch 35c8b1f).
- **Places:** 84 of 3,600 requests used in November.
- **Webhooks:** Quo works (secret set as Secret; `call.completed` + `call.ringing`). PayPal **not configured** (`/hooks/paypal` answers 503).
- **Replies:** none yet besides the bounce. Subject test: A 0/5, B 0/4.
- Today's outbox (2026-11-27) is fully sent; tomorrow's list comes from the 5:37 ET run.

## Open items
- **Alon:** add `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_WEBHOOK_ID` in Cloudflare (neon-sign-sites → Settings → Variables and Secrets) with **Type: Secret**. His first try was Text and the next deploy erased them. Then send an unsigned POST to `/hooks/paypal`: the dashboard's "PayPal:" line says "PayPal login OK" or "login failed".
- **Alon:** the .com mailbox question (hello@/alon@ live as aliases in alon@neonsignsites.net, which also sends cold email). Proposed: a separate alon@neonsignsites.com user in Google Workspace. Not decided.
- **Alon:** iPostal1: add "Neon Sign Sites" as a recipient name on the mailbox (Form 1583).
- **Alon:** Quo "Complete account" (outgoing limit 3 new conversations a day until verified; texting registration).
- **Later:** automatic small edits for customers (with Alon's approval); one follow-up email (needs Alon's OK to change "one email per business"); category pills / per-trade samples on the home page.

## Decisions Alon made today (now in CLAUDE.md unless noted)
- Bulk approval of each day's list; fill every day to the maximum; send every day incl. weekends; Instantly ramp up to 30 per box.
- Sonnet 5.5 stays for previews (model test: Opus not better, 2x cost); Message Batches for the AI step.
- Reply check every 2 h (7:03-23:03 ET) on Haiku, drafts by Opus; reply notifications kept as the exception to "notify only for the list".
- Toll-free (888) 444-1847 on Quo; no bold, a call line before the signature.

## Watch out
- **Cloudflare Text variables are erased by every deploy** (wrangler.jsonc `vars` replace them). Secrets survive. Always tell Alon "Type: Secret", and never put secrets in wrangler.jsonc.
- **Webhook secrets** starting `whsec_` use Standard Webhooks signatures (handled in `hooks.js`).
- **KV list() is eventually consistent** (up to ~1 min after a delete).
- **Never GET a preview URL** to check it (counts as a visit); use HEAD.
- **Dashboard client JS lives inside a template literal** in `dashboard.mjs`: no backticks, no `${}` and no `\'` in the browser script.
- From this cloud session: no `dig`, Cloudflare DNS-over-HTTPS and www.neonsignsites.com are blocked by the proxy; paypal.com can't be fetched.

## Update 2026-11-28 (morning)
- Done: address check (`npm run mx`, builder runs it daily; leads/mx.json), one same-thread follow-up after 4 days (first ones due 2026-12-01), new customer → "Payment received" note → reply check launches the site and drafts the domain email (`npm run answer -- --customer`). PayPal keys set as Secrets; login checked OK (webhook ID confirmed only by the first real event).
- neonsignsites.co email DNS is complete (MX, SPF, DKIM, DMARC p=none, no rua). Our Cloudflare token covers only .com and .net.
- Decided: no inbox-placement seed test and no Instantly API for now; revisit when the reply numbers come in (about 150 emails; near 0% replies would point at spam).
- Not now (Alon): separate .com mailbox; receipts setup.
- **Daily list moved (Alon, 2026-11-28):** the daily list run now fires into the builder chat (`trig_018XQnPonED8vNfBAUKhEjSg`, 5:37 ET / 12:37 Israel), sends Alon a push itself and waits for "go" there. The hidden-session task `trig_016zFxSADCoihHr8BUxxe3QE` is disabled (its sessions could not push). Today's list of 30 sits unpushed in session_019BJDWtDAdRfffTrCy3tCrY: if it is re-planned elsewhere, check leads/sent.json first so no email goes out twice.
- Fresh-session tasks (reply check, preview builder) now start with add_repo (push) so their commits reach main.
