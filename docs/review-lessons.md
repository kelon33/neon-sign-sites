# Review lessons

Every hand fix or rejection in a preview review, and the script change that stops it next time (rule in CLAUDE.md). Newest first.

## 2026-11-27 (batch of 85: boat, dent, painting)

| Problem | Previews | Cause | Script change | Status |
|---|---|---|---|---|
| Placeholder email (`john@doe.com`) | 2 | Site template left a sample address; the scraper took it | `JUNK_EMAIL` drops `@doe.com` | done |
| Unsubscribe address (`unsubscriberequest@constantcontact.com`) | 1 | Newsletter footer link on their site | `JUNK_EMAIL` drops `unsubscribe*@` and `@constantcontact.` | done |
| Email with page code stuck to it (`…@gmail.com&quot;],…`) | 1 | Email regex ran into page-builder JSON | `JUNK_EMAIL` drops any address with a character an email can't have. Better: cut the address at the first such character instead of dropping it | dropped done; clean-up open |
| Franchise built (That 1 Painter, Southern Painting) | 2 | Not on the chain list; Claude said "franchise" in its notes but nothing acted on it | Both added to `CHAINS`. Open: a note saying franchise rejects the preview automatically | list done; auto-reject open |
| Not the trade (boat builder; reconstruction company; dent repair sent out to a partner) | 3 | The Places search phrase matched; nothing checks that the business does the work | Open: the AI answer gets a `fit` field (does this business do <trade> itself?) and `fit: false` skips the preview | open |
| Car business labelled "Boat detailing" (kicker, title, footer, boat headline) | 3 | Trade comes from the search; the car/boat check only fires when the site never mentions boats | Open: pick the label from their services (mostly cars → car wording) | open |
| Builds failed on images that can't be decoded | 3 | One bad image stops the whole build | Open: skip an image that fails to decode | open |
| Build failed on my `git stash -u` during the batch | 1 | Mine, not the script | Rule: never stash while a batch runs | done |
