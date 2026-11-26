# Outreach

First emails to the businesses whose previews are ready, sent from the six cold mailboxes
(`neonsignsites.net` and `neonsignsites.co`) in turn, never from neonsignsites.com.

## The flow

1. `npm run outreach -- plan`: every preview in `demos/` with a ready `email.txt` that nobody has written
   to yet goes into `outreach/batches/<date>.json`, and `<date>.txt` shows every email in full. The postal
   address from `config.json` is filled in. A preview is left out if it has no address, is on
   `do-not-contact.json`, its email lacks its preview link or the opt-out line, or its state is unknown.
2. Alon reads the `.txt` and approves the whole batch: `npm run outreach -- approve --batch <file>`
   (`--except slug,slug` leaves some out). Approval is bound to the exact text: an email changed after
   approval is not sent.
3. `npm run outreach -- send` is a dry run; `--confirm` sends. Each email goes out:
   - only on a weekday, 8:00-12:00 in the business's own time zone (from the state in its site);
     the rest wait for a later run;
   - from the mailbox with the most room left today. Each mailbox ramps on its own: 10 a day in its
     first week of cold email, then 15, 20, 30 (`ramp`), back to 10 if 2% or more bounced;
   - 1 to 2.5 minutes apart, only if their domain receives mail and the preview link loads;
   - never twice to the same business: `outreach/log.json` (committed) and each mailbox's sent folder.
4. `npm run outreach -- replies` reads all six inboxes. A "no" and every bounce go onto
   `do-not-contact.json` straight away (CAN-SPAM). Yes and questions are shown for Alon, kept in
   `outreach/replies.json`.
5. `npm run outreach -- answer --to <address> --text <file>` shows an answer; `--confirm` sends it,
   only after Alon approved that answer, from the mailbox they replied to, in their conversation.

Nothing sends before `outreach.startDate` in `config.json`, or without `sender.address`.
Commit and push `outreach/` and `do-not-contact.json` after every send or replies run.

## Mailbox access (once)

One Internal Google app for the Workspace, and one sign-in per mailbox:

1. At console.cloud.google.com, signed in as the Workspace admin, create a project (e.g. "neon-outreach").
2. APIs & Services → Library → **Gmail API** → Enable.
3. Google Auth Platform → Branding: app name and support email. Audience: **Internal**.
   Data access → add the scopes `.../auth/gmail.send` and `.../auth/gmail.readonly`.
4. Clients → Create client → **Web application**. Authorized redirect URI:
   `https://developers.google.com/oauthplayground`. Keep the client ID and secret.
5. For each of the six mailboxes, in a private window: open developers.google.com/oauthplayground →
   gear icon → "Use your own OAuth credentials" → the client ID and secret. In Step 1 type
   `https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly` →
   Authorize APIs → sign in **as that mailbox** → Step 2 "Exchange authorization code for tokens" →
   copy the **refresh token**.
6. In the cloud environment's settings, add the variables `NEON_GMAIL_CLIENT_ID`,
   `NEON_GMAIL_CLIENT_SECRET` and one `NEON_GMAIL_TOKEN_*` per mailbox (names in `config.json`
   `outreach.mailboxes`). A new session picks them up. Never paste them into chat or the repo.
