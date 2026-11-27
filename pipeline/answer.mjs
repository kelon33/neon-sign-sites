#!/usr/bin/env node
// Sends Alon's approved answer to a reply, from the mailbox that got it, in the same email thread,
// so he never has to sign in to the six mailboxes.
//   npm run answer -- --reply <id from leads/replies.json> --file <answer.txt> [--dry]
// Only after Alon approved the exact text (CLAUDE.md). The signature is added from config.json sender.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenVar } from './send.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (file, fallback) => readFile(file, 'utf8').then(JSON.parse).catch(() => fallback);
const header = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);

/** The raw answer email, threaded under their message (In-Reply-To / References). */
export function answerMime({ from, fromName, to, subject, inReplyTo, body }) {
  const msg = [
    `From: ${header(fromName)} <${from}>`, `To: ${to}`,
    `Subject: ${header(/^re:/i.test(subject) ? subject : `Re: ${subject}`)}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    Buffer.from(body.replace(/\r?\n/g, '\r\n')).toString('base64').replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
  return Buffer.from(msg).toString('base64url');
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  const config = await json(path.join(root, 'config.json'), {});
  const file = path.join(root, 'leads', 'replies.json');
  const store = await json(file, { replies: [] });
  const r = store.replies.find((x) => x.id === arg('reply'));
  if (!r) throw new Error('No such reply in leads/replies.json (--reply <id>).');
  if (r.kind === 'no' || r.kind === 'bounce') throw new Error(`That message is a "${r.kind}": never answer it.`);
  const text = (await readFile(arg('file'), 'utf8')).trim();
  const s = config.sender;
  const body = `${text}\n\n${s.name}\nNeon Sign Sites\n${s.phone ?? ''}\n${s.address}\n`.replace(/\n\n\n/g, '\n\n');
  const to = r.from;
  if (args.includes('--dry')) { console.log(`From: ${r.box}\nTo: ${to}\nSubject: Re: ${r.subject}\n\n${body}`); return; }
  const t = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.NEON_GMAIL_CLIENT_ID, client_secret: process.env.NEON_GMAIL_CLIENT_SECRET, refresh_token: process.env[tokenVar(r.box)] ?? '', grant_type: 'refresh_token' }) })).json();
  if (!t.access_token) throw new Error(`Gmail sign-in failed for ${r.box}.`);
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: answerMime({ from: r.box, fromName: s.name, to, subject: r.subject, inReplyTo: r.messageId, body }), threadId: r.threadId }) });
  const j = await res.json();
  if (!res.ok) throw new Error(`Gmail refused the answer: ${res.status} ${j.error?.message ?? ''}`);
  r.answered = [...(r.answered ?? []), { at: new Date().toISOString(), id: j.id, text }];
  await writeFile(file, JSON.stringify(store, null, 1) + '\n');
  console.log(`Answer sent to ${to} from ${r.box}, in the same thread. Commit leads/replies.json.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
