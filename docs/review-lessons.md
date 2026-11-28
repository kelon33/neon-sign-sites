# Review lessons

Every hand fix or rejection in a preview review, and the script change that stops it next time (rule in CLAUDE.md). Newest first.

## 2026-11-28 (24 leads left from found-2026-11-27)

| Problem | Previews | Cause | Script change | Status |
|---|---|---|---|---|
| Not the trade (fiberglass/gelcoat shop, marine repair shop) | 2 | Search phrase matched | Caught by yesterday's `fit` check: not built, added to rejected.json automatically | done (worked) |
| Builds failed: "source image cannot be decoded" | 2 | Thumbnails were made on the tab last used to open an image; a site's page rules there blocked data: images | `thumbnail()` runs on about:blank | done |
| Only email is `donotreply@` | 1 | Not in the junk list | `JUNK_EMAIL` drops `donotreply@` / `do-not-reply@` | done |
| Email belongs to another business that already has a preview (info@nexterras.com on Dent Concepts) | 1 | Shared site or designer; nothing compared emails across previews | `batch` skips a lead whose email a built preview already uses | done |
| Email on an unrelated spam domain (gudanghokiwebsite.com; site likely hacked) | 1 | `pickEmail` keeps an other-domain address with a note, but the note never reached the review | The note now goes into check.txt ("Email …: email domain differs from the website") so the digest shows it. Open: reject other-domain emails whose domain looks like spam | note done; spam check open |
| Preview built from an error page ("upstream request failed"; Immaculate Auto Detailing), no email | 1 | The scraper returned the error text as their site | `cli` stops when the text is under 150 characters or starts like an error page; the lead can be retried later | done |
| Possible typo in their own address (unchorsupdetailing@ for Anchors Up) | 1 | Their site's own spelling | Open: the pre-send email check (planned) catches addresses that don't exist | open |

## 2026-11-27 (batch of 85: boat, dent, painting)

| Problem | Previews | Cause | Script change | Status |
|---|---|---|---|---|
| Placeholder email (`john@doe.com`) | 2 | Site template left a sample address; the scraper took it | `JUNK_EMAIL` drops `@doe.com` | done |
| Unsubscribe address (`unsubscriberequest@constantcontact.com`) | 1 | Newsletter footer link on their site | `JUNK_EMAIL` drops `unsubscribe*@` and `@constantcontact.` | done |
| Email with page code stuck to it (`…@gmail.com&quot;],…`) | 1 | Email regex ran into page-builder JSON | `JUNK_EMAIL` drops any address with a character an email can't have. `pickEmail` now cuts the address at the first such character (test added) | done |
| Franchise built (That 1 Painter, Southern Painting) | 2 | Not on the chain list; Claude said "franchise" in its notes but nothing acted on it | Both added to `CHAINS`; the AI answer's `fit: 'franchise'` rejects the preview automatically (leads/rejected.json, `auto: true`) | done |
| Not the trade (boat builder; reconstruction company; dent repair sent out to a partner) | 3 | The Places search phrase matched; nothing checks that the business does the work | The AI answer's `fit` field: `other-trade` rejects the preview automatically | done |
| Car business labelled "Boat detailing" (kicker, title, footer, boat headline) | 3 | Trade comes from the search; the car/boat check only fires when the site never mentions boats | A car-and-boat detailer with at least as many car words as boat words gets the neutral "Mobile detailing" label (`vehicleCounts` in checks.mjs) | done |
| Builds failed on images that can't be decoded | 3 | One bad image stops the whole build | `saveImage` survives a lost body; each saved photo must decode for its thumbnail or it is skipped | done |
| Build failed on my `git stash -u` during the batch | 1 | Mine, not the script | Rule: never stash while a batch runs | done |
