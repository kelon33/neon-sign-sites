#!/usr/bin/env node
// Sends the day's approved cold emails through Gmail, one mailbox each, spaced out through the day.
//   npm run queue -- --plan                 writes outbox/<date>.md (to read) and outbox/<date>.json (what is sent)
//   npm run send -- --approve [--skip 4,7]  records Alon's approval of that list, as a whole ("go, skip #4")
//   npm run send [-- --dry] [--gap 120-300] sends every approved email not sent yet, then logs it in leads/sent.json
//
// Alon approves each day's list as a whole (CLAUDE.md); --approve records that. Before each email it
// checks again: approved and unchanged since approval, never from neonsignsites.com, the mailbox's daily
// limit, one email per business, the do-not-contact list, the postal address, and that the preview opens.
// Credentials: NEON_GMAIL_CLIENT_ID, NEON_GMAIL_CLIENT_SECRET and a refresh token per mailbox,
// NEON_GMAIL_TOKEN_<NAME>_<TLD> (alon.katz@neonsignsites.net → NEON_GMAIL_TOKEN_ALON_KATZ_NET). Never printed.

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blocked } from './dnc.mjs';
import { dailyLimit } from './queue.mjs';
import { windowState } from './timing.mjs';
import { JUNK_EMAIL } from './find.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SENT = path.join(root, 'leads', 'sent.json');
const today = () => new Date().toISOString().slice(0, 10);
const json = (file, fallback) => readFile(file, 'utf8').then(JSON.parse).catch(() => fallback);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** The environment variable that holds a mailbox's refresh token. */
export function tokenVar(address) {
  const [local, domain] = address.toLowerCase().split('@');
  return `NEON_GMAIL_TOKEN_${local.replace(/[^a-z0-9]+/g, '_')}_${domain.split('.').pop()}`.toUpperCase();
}

/** To:, Subject: and the body of a draft (demos/<slug>/email.txt). */
export function parseDraft(text) {
  const [head, ...rest] = text.replace(/\r\n/g, '\n').split('\n\n');
  const to = head.match(/^To: *(.+)$/m)?.[1].trim();
  const subject = head.match(/^Subject: *(.+)$/m)?.[1].trim();
  return { to, subject, body: rest.join('\n\n').trim() + '\n' };
}

const header = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);

/** A plain-text email, as Gmail's API takes it (base64url of the whole message). */
export function mime({ from, fromName, to, subject, body }) {
  const msg = [
    `From: ${header(fromName)} <${from}>`,
    `To: ${to}`,
    `Subject: ${header(subject)}`,
    `List-Unsubscribe: <mailto:${from}?subject=unsubscribe>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body.replace(/\r?\n/g, '\r\n')).toString('base64').replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
  return Buffer.from(msg).toString('base64url');
}

/** Why this email must not go out now, or null. */
export function refuse(e, { approved, sent, dnc, mailboxes, config, day = today() }) {
  if (!approved) return 'the list is not approved';
  if ((approved.skip ?? []).includes(e.n)) return 'skipped by Alon';
  if (approved.hashes?.[e.n] !== hash(e.text)) return 'its text changed after approval';
  if (/@neonsignsites\.com$/i.test(e.from)) return 'never from neonsignsites.com';
  const box = mailboxes.find((b) => b.address === e.from);
  if (!box) return `${e.from} is not a sending mailbox in config.json`;
  if (sent.filter((s) => s.from === e.from && s.date === day).length >= dailyLimit(box, day)) return `${e.from} reached today's limit`;
  if (sent.some((s) => s.slug === e.slug || s.to?.toLowerCase() === e.to.toLowerCase())) return 'already emailed (one email per business)';
  if (blocked({ email: e.to, name: e.name }, dnc)) return 'on the do-not-contact list';
  if (JUNK_EMAIL.test(e.to)) return `${e.to} is not their address (a font licence or placeholder)`;
  if (!config.sender?.address || !e.text.includes(config.sender.address)) return 'no postal address in the email';
  if (!/Reply "no"/.test(e.text)) return 'no opt-out line in the email';
  return null;
}

async function accessToken(address) {
  const refresh = process.env[tokenVar(address)];
  if (!refresh) throw new Error(`No ${tokenVar(address)} in the environment.`);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.NEON_GMAIL_CLIENT_ID, client_secret: process.env.NEON_GMAIL_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Gmail sign-in failed for ${address}: ${j.error ?? r.status}`);
  return j.access_token;
}

async function gmailSend(e, fromName) {
  const { to, subject, body } = parseDraft(e.text);
  if (to.toLowerCase() !== e.to.toLowerCase()) throw new Error(`${e.slug}: To: line and plan disagree.`);
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { authorization: `Bearer ${await accessToken(e.from)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: mime({ from: e.from, fromName, to, subject, body }) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gmail refused ${e.slug} from ${e.from}: ${r.status} ${j.error?.message ?? ''}`);
  return { id: j.id, threadId: j.threadId, subject };
}

async function opens(url) {
  try { return (await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) })).ok; } catch { return false; }
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  const file = path.join(root, 'outbox', `${arg('date') ?? today()}.json`);
  const outbox = await json(file, null);
  if (!outbox) throw new Error(`No ${path.relative(root, file)}: run npm run queue -- --plan first.`);

  if (args.includes('--approve')) {
    const skip = (arg('skip') ?? '').split(',').map((s) => Number(s.replace('#', ''))).filter(Boolean);
    outbox.approved = { at: new Date().toISOString(), skip, hashes: Object.fromEntries(outbox.emails.map((e) => [e.n, hash(e.text)])) };
    await writeFile(file, JSON.stringify(outbox, null, 1) + '\n');
    console.log(`Approved ${outbox.emails.length - skip.length} of ${outbox.emails.length} emails${skip.length ? ` (skipping #${skip.join(', #')})` : ''}. Send with: npm run send`);
    return;
  }

  const config = await json(path.join(root, 'config.json'), {});
  const mailboxes = config.sending?.mailboxes ?? [];
  const dnc = (await json(path.join(root, 'do-not-contact.json'), { entries: [] })).entries;
  const dry = args.includes('--dry');
  const [lo, hi] = (arg('gap') ?? '120-300').split('-').map(Number);
  let sentNow = 0;
  // Each email goes out inside its business's working-day window (pipeline/timing.mjs): east first,
  // waiting for the window to open; one that finds its window closed stays for the next day's list.
  const ORDER = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];
  const queue = [...outbox.emails].sort((a, b) => ORDER.indexOf(a.tz ?? 'America/New_York') - ORDER.indexOf(b.tz ?? 'America/New_York'));
  for (const e of queue) {
    const sent = await json(SENT, []);
    const no = refuse(e, { approved: outbox.approved, sent, dnc, mailboxes, config, day: outbox.date });
    if (no) { console.log(`#${e.n} ${e.slug}: not sent (${no}).`); continue; }
    if (e.link && !(await opens(e.link))) { console.log(`#${e.n} ${e.slug}: not sent (the preview ${e.link} does not open).`); continue; }
    const tz = e.tz ?? 'America/New_York';
    if (dry) { console.log(`#${e.n} ${e.slug}: would send to ${e.to} from ${e.from} (${tz}: ${windowState(tz)}).`); continue; }
    if (sentNow) await sleep((lo + Math.random() * (hi - lo)) * 1000);
    while (windowState(tz) === 'wait') await sleep(60_000);
    if (windowState(tz) === 'late') { console.log(`#${e.n} ${e.slug}: not sent (after 17:00 their time; it goes on the next list).`); continue; }
    const r = await gmailSend(e, config.sender.name);
    sent.push({ date: outbox.date, slug: e.slug, to: e.to, from: e.from, variant: e.variant ?? null, subject: r.subject, messageId: r.id, threadId: r.threadId, sentAt: new Date().toISOString() });
    await writeFile(SENT, JSON.stringify(sent, null, 1) + '\n');
    sentNow++;
    console.log(`#${e.n} ${e.slug}: sent to ${e.to} from ${e.from}.`);
  }
  console.log(dry ? 'Dry run: nothing sent.' : `${sentNow} sent. Commit leads/sent.json.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
