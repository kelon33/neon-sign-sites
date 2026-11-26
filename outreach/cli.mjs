#!/usr/bin/env node
// npm run outreach -- plan | approve | send | replies | answer | status   (see outreach/README.md)

import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { openLog, normalize } from './log.mjs';
import { planBatch, readable, approvedMessages, hashOf } from './batch.mjs';
import { dailyLimit, inWindow, pickMailbox, localTime } from './pace.mjs';
import { credentials, gmailClient, gmailTransport, sentAddresses, inbox, bouncedAddress } from './gmail.mjs';
import { classify, ownWords, senderAddress, matchEntry } from './replies.mjs';
import { acceptsMail } from './mx.mjs';
import { blocked } from '../pipeline/dnc.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const here = (...p) => path.join(root, 'outreach', ...p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
const readJson = async (file, fallback) => (existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : fallback);
const writeJson = (file, value) => writeFile(file, JSON.stringify(value, null, 1) + '\n');

const HELP = `Outreach: first emails to the businesses whose previews are ready, from the cold mailboxes in turn.

  npm run outreach -- plan [--only slug,slug]        ready previews → outreach/batches/<date>.json + .txt (read the .txt)
  npm run outreach -- approve --batch <file> [--except slug,slug]   Alon approved the batch: lock the exact texts
  npm run outreach -- send                            dry run: who would get what, from which mailbox
  npm run outreach -- send --confirm                  really sends: approved, in their business hours, within each mailbox's limit
  npm run outreach -- replies                         new replies: no and bounces → do-not-contact.json; yes/questions shown
  npm run outreach -- answer --to <address> --text <file> [--confirm]   an approved answer, in their conversation
  npm run outreach -- status                          per mailbox: sent today, today's limit, last 7 days
`;

async function load() {
  const config = await readJson(path.join(root, 'config.json'), {});
  const o = config.outreach;
  if (!o?.mailboxes?.length) throw new Error('config.json has no outreach.mailboxes.');
  const log = await openLog(here('log.json'));
  const dncFile = path.join(root, 'do-not-contact.json');
  const dnc = await readJson(dncFile, { entries: [] });
  return { config, o, log, dnc, dncFile };
}

/** Adds an opt-out or a bounce to do-not-contact.json (never removes anything). */
async function addDnc(ctx, entry) {
  if (ctx.dnc.entries.some((e) => e.email && e.email === entry.email)) return;
  ctx.dnc.entries.push({ ...entry, date: today() });
  await writeJson(ctx.dncFile, ctx.dnc);
}

async function batchFiles() {
  const dir = here('batches');
  return existsSync(dir) ? (await readdir(dir)).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f)) : [];
}

async function plan(values) {
  const ctx = await load();
  const only = values.only?.split(',').map((s) => s.trim());
  // Leads already in an earlier batch are not planned twice.
  const queued = new Set();
  for (const f of await batchFiles()) for (const m of await readJson(f, [])) queued.add(m.slug);
  const { ready, skipped } = await planBatch({ root, config: ctx.config, log: ctx.log, dnc: ctx.dnc.entries, only });
  const fresh = ready.filter((m) => !queued.has(m.slug));
  for (const m of ready) if (queued.has(m.slug)) skipped.push({ slug: m.slug, name: m.name, reason: 'already in an earlier batch' });
  if (!fresh.length) {
    console.log('Nothing new to approve.');
  } else {
    await mkdir(here('batches'), { recursive: true });
    const base = here('batches', `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`);
    await writeJson(`${base}.json`, fresh);
    await writeFile(`${base}.txt`, readable(fresh));
    console.log(`${fresh.length} emails ready for approval → ${path.relative(root, base)}.txt (every email in full)`);
  }
  for (const s of skipped) console.log(`  skipped  ${s.slug}: ${s.reason}`);
}

async function approve(values) {
  if (!values.batch) throw new Error('Which batch? --batch outreach/batches/<date>.json');
  const file = path.resolve(root, values.batch);
  const batch = await readJson(file, null);
  if (!batch) throw new Error(`No batch at ${values.batch}`);
  const except = new Set(values.except?.split(',').map((s) => s.trim()) ?? []);
  const at = new Date().toISOString();
  let n = 0;
  for (const m of batch) {
    if (except.has(m.slug)) { m.approved = false; m.rejected = true; continue; }
    m.hash = hashOf(m); // the text as it stands now, which is what Alon read
    m.approved = true;
    m.approvedAt = at;
    n++;
  }
  await writeJson(file, batch);
  console.log(`Approved ${n} of ${batch.length}${except.size ? ` (left out: ${[...except].join(', ')})` : ''}.`);
}

/** Each mailbox with its limit and what is left today. */
function mailboxState(ctx, now = new Date()) {
  const since = now.getTime() - 7 * 86400000;
  return ctx.o.mailboxes.filter((b) => b.active !== false).map((b) => {
    const sent7 = ctx.log.sentSince(b.address, since);
    const bounced7 = sent7.filter((e) => e.bounced).length;
    const limit = dailyLimit({ firstSentAt: ctx.log.firstSentAt(b.address), now, ramp: ctx.o.ramp, max: ctx.o.maxDaily, sent7: sent7.length, bounced7 });
    const done = ctx.log.sentToday(b.address, now);
    return { ...b, limit, done, left: Math.max(limit - done, 0), lastAt: ctx.log.lastAt(b.address), sent7: sent7.length, bounced7 };
  });
}

async function send(values) {
  const ctx = await load();
  const dryRun = !values.confirm;
  if (!ctx.config.sender?.address) throw new Error('No postal address in config.json (sender.address): required by law before any cold email.');
  if (!dryRun && !ctx.o.startDate) throw new Error('No start date (config.json outreach.startDate): set it once the mailboxes are warmed up.');
  if (!dryRun && localTime(new Date(), 'America/New_York').date < ctx.o.startDate) {
    return console.log(`Sending starts on ${ctx.o.startDate} (config.json outreach.startDate). Nothing sent.`);
  }
  const boxes = mailboxState(ctx);
  const clients = new Map();
  if (!dryRun) {
    for (const b of boxes) clients.set(b.address, gmailClient(credentials(b)));
    // The sent folders are the backup of the log: anyone found there is never written to again.
    for (const b of boxes) {
      const known = new Set(ctx.log.entries.map((e) => e.email));
      for (const to of await sentAddresses(clients.get(b.address))) {
        if (!known.has(to)) await ctx.log.record({ email: to, slug: '', via: b.address, status: 'sent', at: new Date(0).toISOString(), fromSentFolder: true });
      }
    }
  }
  const queue = [];
  for (const f of await batchFiles()) for (const m of approvedMessages(await readJson(f, []))) queue.push(m);
  const now = () => new Date();
  const mx = new Map();
  const [minDelay, maxDelay] = ctx.o.delaySeconds ?? [60, 150];
  let sent = 0;
  console.log(dryRun ? 'DRY RUN: nothing is sent (add --confirm).' : 'Sending.');
  for (const b of boxes) console.log(`  ${b.address.padEnd(28)} today ${b.done}/${b.limit}`);
  for (const m of queue) {
    if (ctx.log.contacted({ email: m.to, slug: m.slug })) continue;
    const no = blocked({ email: m.to, name: m.name }, ctx.dnc.entries);
    if (no) { console.log(`  skip  ${m.slug}: on the do-not-contact list`); continue; }
    if (!values.now && !inWindow(now(), m.timeZone, ctx.o.window)) { console.log(`  later ${m.slug}: outside business hours in ${m.timeZone}`); continue; }
    const box = pickMailbox(boxes);
    if (!box) { console.log('  Every mailbox has reached today\'s limit.'); break; }
    if (values.max && sent >= Number(values.max)) break;
    if (!(await acceptsMail(m.to, { cache: mx }))) { console.log(`  skip  ${m.slug}: ${m.to.split('@')[1]} receives no mail`); continue; }
    const live = await fetch(m.link, { method: 'HEAD', signal: AbortSignal.timeout(15000) }).then((r) => r.ok).catch(() => false);
    if (!live) { console.log(`  skip  ${m.slug}: the preview ${m.link} does not load`); continue; }
    if (dryRun) {
      console.log(`  would ${m.to} (${m.name}) from ${box.address}`);
    } else {
      const entry = { email: normalize(m.to), slug: m.slug, name: m.name, subject: m.subject, via: box.address, at: now().toISOString(), status: 'sending' };
      await ctx.log.record(entry); // recorded before sending: a crash can never cause a second email
      try {
        const transport = gmailTransport({ client: clients.get(box.address), from: `${box.name ?? ctx.config.sender.name} <${box.address}>` });
        const { id, thread } = await transport({ to: m.to, subject: m.subject, text: m.text });
        await ctx.log.record({ ...entry, status: 'sent', id, thread });
        console.log(`  sent  ${m.to} (${m.name}) from ${box.address}`);
      } catch (error) {
        await ctx.log.record({ ...entry, status: 'failed', error: String(error.message ?? error) });
        console.log(`  FAILED ${m.to} from ${box.address}: ${error.message}. Stopping; look before trying again.`);
        process.exitCode = 1;
        break;
      }
    }
    box.done++; box.left--; box.lastAt = now().toISOString();
    sent++;
    if (!dryRun) await sleep((minDelay + Math.random() * (maxDelay - minDelay)) * 1000);
  }
  console.log(`${dryRun ? 'Would send' : 'Sent'}: ${sent}.`);
}

async function replies() {
  const ctx = await load();
  const file = here('replies.json');
  const history = await readJson(file, []);
  const seen = new Set(history.map((r) => r.id));
  const found = [];
  for (const b of mailboxState(ctx)) {
    const client = gmailClient(credentials(b));
    for (const msg of await inbox(client, { seen })) {
      const bounce = bouncedAddress(msg);
      if (bounce) {
        const entry = ctx.log.entries.find((e) => e.email === bounce);
        if (entry) await ctx.log.record({ ...entry, bounced: true });
        await addDnc(ctx, { email: bounce, reason: 'bounced' });
        found.push({ id: msg.id, mailbox: b.address, at: msg.at, from: bounce, kind: 'bounce', words: 'Undeliverable.' });
        continue;
      }
      const reply = { id: msg.id, mailbox: b.address, thread: msg.thread, at: msg.at, from: senderAddress(msg.from), subject: msg.subject, messageId: msg.headers['message-id'] ?? '' };
      const entry = matchEntry({ ...reply, from: msg.from }, ctx.log.entries);
      if (!entry) { found.push({ ...reply, kind: 'other' }); continue; } // warm-up mail, notices: not a lead
      Object.assign(reply, { slug: entry.slug, name: entry.name, kind: classify(msg), words: ownWords(msg.text).slice(0, 2000) });
      if (reply.kind === 'no') {
        const domain = reply.from.split('@')[1];
        await addDnc(ctx, { email: reply.from, ...(!/^(gmail|yahoo|hotmail|outlook|aol|icloud)\.com$/.test(domain) && { domain }), name: entry.name, reason: 'replied no' });
        if (entry.email !== reply.from) await addDnc(ctx, { email: entry.email, name: entry.name, reason: 'replied no' });
      }
      found.push(reply);
    }
  }
  history.push(...found);
  await writeJson(file, history);
  const shown = found.filter((r) => r.kind !== 'other');
  if (found.length > shown.length) console.log(`(${found.length - shown.length} other messages set aside: not from a business we emailed.)`);
  if (!shown.length) return console.log('No new replies.');
  for (const r of shown) console.log(`\n${r.kind.toUpperCase().padEnd(8)} ${r.name ?? ''} <${r.from}>  to ${r.mailbox}  ${r.at}\n${(r.words ?? '').split('\n').map((l) => `   | ${l}`).join('\n')}`);
  const count = (k) => shown.filter((r) => r.kind === k).length;
  console.log(`\n${shown.length} new: ${count('yes')} yes, ${count('question')} questions, ${count('no')} no (added to do-not-contact), ${count('bounce')} bounced (added), ${count('auto')} automatic.`);
}

async function answer(values) {
  if (!values.to || !values.text) throw new Error('Usage: answer --to <their address> --text <file> [--confirm]');
  const ctx = await load();
  const history = await readJson(here('replies.json'), []);
  const who = normalize(values.to);
  const reply = history.filter((r) => r.from === who && (r.kind === 'yes' || r.kind === 'question')).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!reply) throw new Error(`${values.to} has not written back with a yes or a question: nothing is sent.`);
  const answers = await readJson(here('answers.json'), []);
  if (answers.some((a) => a.replyId === reply.id)) throw new Error(`Their reply of ${reply.at} was already answered.`);
  const text = (await readFile(path.resolve(root, values.text), 'utf8')).trim() + '\n';
  const subject = /^\s*re\s*:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}`;
  const box = ctx.o.mailboxes.find((b) => b.address === reply.mailbox);
  if (!values.confirm) return console.log(`DRY RUN (add --confirm)\nFrom: ${box.address}\nTo: ${reply.from} (${reply.name})\nSubject: ${subject}\n\n${text}`);
  const send = gmailTransport({ client: gmailClient(credentials(box)), from: `${box.name ?? ctx.config.sender.name} <${box.address}>` });
  const { id, thread } = await send({ to: reply.from, subject, text, thread: reply.thread, inReplyTo: reply.messageId });
  answers.push({ replyId: reply.id, to: reply.from, slug: reply.slug, from: box.address, subject, at: new Date().toISOString(), id, thread });
  await writeJson(here('answers.json'), answers);
  console.log(`Sent to ${reply.from} from ${box.address}, in their conversation.`);
}

async function status() {
  const ctx = await load();
  for (const b of mailboxState(ctx)) console.log(`${b.address.padEnd(28)} today ${b.done}/${b.limit}   last 7 days ${b.sent7} sent, ${b.bounced7} bounced`);
  const sent = ctx.log.entries.filter((e) => e.status === 'sent' && e.slug);
  console.log(`${sent.length} businesses emailed, ${ctx.dnc.entries.length} on the do-not-contact list.`);
}

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    only: { type: 'string' }, batch: { type: 'string' }, except: { type: 'string' }, confirm: { type: 'boolean', default: false },
    now: { type: 'boolean', default: false }, max: { type: 'string' }, to: { type: 'string' }, text: { type: 'string' },
  },
});
const commands = { plan, approve, send, replies, answer, status };
(commands[command] ?? (async () => console.log(HELP)))(values).catch((error) => {
  console.error(`\nStopped: ${error.message}`);
  process.exitCode = 1;
});
