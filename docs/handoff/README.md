# Daily handoff

Each role keeps one chat. The chat history is cleared every night; these files carry the work from one
day to the next. One file per role (`builder.md`, `site.md`, and `list.md` until Alon merges the site chats).

## Evening (23:13 Israel time, a scheduled message in the chat)
1. `git pull` on main. Rewrite your role's file (keep it under about 150 lines), in this order:
   - **Session:** the chat's session ID (from `get_session`), date.
   - **Done today:** what changed, with commit hashes for anything that matters.
   - **State:** what is live, what is on branches and not merged, counts that matter (previews ready, leads left, requests used this month).
   - **Open items:** what is waiting and on whom (Alon, another chat, a scheduled task), with exact next steps.
   - **Decisions Alon made today** that are not yet rules.
   - **Watch out:** traps found today (tools, limits, rate limits, environment quirks).
2. Anything that should hold from now on goes into `CLAUDE.md` (a rule, a command, a convention), not only here.
3. Commit (`Handoff <role> <date>`, with the session's attribution lines) and push to main. Tell Alon in two lines, ending with "Saved. You can type /clear in this chat now." Alon then clears the chat.

## Morning (06:47 Israel time, a scheduled message in the same chat)
1. Pull main. Read `CLAUDE.md` and your role's file (the only memory left if the chat was cleared).
2. Post Alon a short note: today's open items and what you will do first. Then work as usual.
