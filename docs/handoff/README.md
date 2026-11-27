# Daily handoff

Chats do not carry history from one day to the next: these files do. Each working chat has a role and
one file here (`builder.md`, `site.md`, and `list.md` until Alon merges the site chats).

## Evening (23:13 Israel time, a reminder in the chat)
1. `git pull` on main. Rewrite your role's file (keep it under about 150 lines), in this order:
   - **Session:** the chat's session ID (from `get_session`), date.
   - **Done today:** what changed, with commit hashes for anything that matters.
   - **State:** what is live, what is on branches and not merged, counts that matter (previews ready, leads left, requests used this month).
   - **Open items:** what is waiting and on whom (Alon, another chat, a scheduled task), with exact next steps.
   - **Decisions Alon made today** that are not yet rules.
   - **Watch out:** traps found today (tools, limits, rate limits, environment quirks).
2. Anything that should hold from now on goes into `CLAUDE.md` (a rule, a command, a convention), not only here.
3. Commit (`Handoff <role> <date>`, with the session's attribution lines) and push to main. Tell Alon in two lines.

## Morning (06:47 Israel time, a scheduled task starts a fresh chat)
1. Read `CLAUDE.md` and your role's file. Pull main.
2. Archive the previous chat (its session ID is at the top of the file) with `archive_session`, unless it is still running.
3. Schedule tonight's handoff in this chat with `send_later` at 23:13 Asia/Jerusalem ("Evening handoff: follow docs/handoff/README.md for the <role> role").
4. Write the new session ID at the top of the file, commit, push, then pick up the open items.
