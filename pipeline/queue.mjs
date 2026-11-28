#!/usr/bin/env node
// Plans each day's cold emails for Alon's approval, and keeps the record of what was sent.
// It never sends anything.
//   npm run queue -- --plan                    today's list: outbox/<date>.md, every email in full, for approval
//   npm run queue -- --record <slug> --from alon@neonsignsites.net    after an email was sent (approved)
//   npm run queue -- --status                  sent so far, per mailbox
//
// Rules it enforces (CLAUDE.md): never from neonsignsites.com; a daily limit per mailbox that ramps
// up with its age (config.json sending: +2 a day up to each mailbox's max, now 30);
// the do-not-contact list checked again at planning time and at recording time; one email per
// business, ever; no plan at all while config.json has no postal address (CAN-SPAM).

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blocked } from './dnc.mjs';
import { JUNK_EMAIL } from './find.mjs';
import { refreshSignature, rewordDraft, subjectFor, followupBody, FOLLOWUP_DAYS, EMAIL_VERSION } from './email.mjs';
import { stateOf, zoneOf } from './timing.mjs';
import { noMail, MX_FILE } from './mx.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SENT = path.join(root, 'leads', 'sent.json');
const today = () => new Date().toISOString().slice(0, 10);

/** Days from start up to day (day 0 = the start day). We send every day, weekends included. */
export function sendingDays(start, day) {
  return Math.max(0, Math.round((Date.parse(day) - Date.parse(start)) / 864e5));
}

/** How many emails a mailbox may send on a day, capped by max. A daily ramp ({ first, step }: first on
 *  the start day, +step every day after) when set, otherwise the weekly ramp. */
export function dailyLimit(box, day = today()) {
  if (/@neonsignsites\.com$/i.test(box.address)) return 0; // the brand domain never sends cold email
  if (!box.start || day < box.start) return 0;
  if (box.daily) return Math.min(box.daily.first + box.daily.step * sendingDays(box.start, day), box.max ?? Infinity);
  const week = Math.floor((Date.parse(day) - Date.parse(box.start)) / (7 * 864e5));
  const ramp = box.ramp ?? [7, 10];
  return Math.min(ramp[Math.min(week, ramp.length - 1)], box.max ?? Infinity);
}

/** The emails for today: each ready preview once, across the mailboxes' remaining room. */
/** First emails that are due their one follow-up: FOLLOWUP_DAYS or more ago, no reaction of any kind
 *  (reply, "no", bounce, site form), no follow-up yet, not on do-not-contact. Exported for tests. */
export function dueFollowups({ sent, replies = [], dnc = [], day = today() }) {
  const reacted = new Set(replies.map((r) => r.slug).filter(Boolean));
  const followed = new Set(sent.filter((s) => s.kind === 'followup').map((s) => s.slug));
  const cutoff = new Date(Date.parse(day) - FOLLOWUP_DAYS * 864e5).toISOString().slice(0, 10);
  return sent.filter((s) => s.kind !== 'followup' && s.messageId && s.threadId && (s.date ?? '') <= cutoff
    && !reacted.has(s.slug) && !followed.has(s.slug) && !blocked({ email: s.to, name: s.slug }, dnc));
}

export function plan({ ready, sent, mailboxes, dnc, mx = {}, replies = [], day = today() }) {
  const done = new Set(sent.flatMap((s) => [s.slug, s.to?.toLowerCase()]));
  const room = mailboxes.map((b) => ({ address: b.address, left: dailyLimit(b, day) - sent.filter((s) => s.from === b.address && s.date === day).length }));
  const out = [];
  const skipped = [];
  // Follow-ups first, each from the mailbox that sent the first email (same thread); they count toward its limit.
  for (const f of dueFollowups({ sent, replies, dnc, day })) {
    const box = room.find((b) => b.address === f.from);
    if (!box || box.left <= 0) continue;
    box.left--;
    out.push({ kind: 'followup', slug: f.slug, to: f.to, from: f.from, threadId: f.threadId, firstMessageId: f.messageId, firstSubject: f.subject });
  }
  for (const r of ready) {
    if (done.has(r.slug) || done.has(r.to.toLowerCase())) continue;
    const no = blocked(r.lead ?? { email: r.to, name: r.name }, dnc);
    if (no) { skipped.push(`${r.slug}: on the do-not-contact list`); continue; }
    if (JUNK_EMAIL.test(r.to)) { skipped.push(`${r.slug}: ${r.to} is not their address (a font licence or placeholder)`); continue; }
    if (mx && noMail(r.to, mx)) { skipped.push(`${r.slug}: ${r.to}: their domain has no mail server (it would bounce)`); continue; }
    const box = room.reduce((best, b) => (b.left > (best?.left ?? 0) ? b : best), null); // spread evenly: the box with the most room
    if (!box) break;
    box.left--;
    out.push({ ...r, from: box.address });
  }
  return { out, skipped, room };
}

/** Each lead's own website, by email, from every leads/*.json file (for subject B: "Quick question about their-site.com"). */
async function websites() {
  const out = {};
  for (const f of await readdir(path.join(root, 'leads'))) {
    if (!f.endsWith('.json')) continue;
    const d = await json(path.join(root, 'leads', f), null);
    const list = Array.isArray(d) ? d : d?.leads ?? [];
    for (const l of Array.isArray(list) ? list : []) if (l?.email && l?.website) out[l.email.toLowerCase()] = l.website;
  }
  return out;
}
const bare = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; } };

async function json(file, fallback) { return readFile(file, 'utf8').then(JSON.parse).catch(() => fallback); }

/** Previews with an email draft: demos/<slug>/email.txt, To: line and all. */
async function readyPreviews() {
  const out = [];
  for (const slug of (await readdir(path.join(root, 'demos'))).sort()) {
    const mail = await readFile(path.join(root, 'demos', slug, 'email.txt'), 'utf8').catch(() => null);
    const to = mail?.match(/^To: *(\S+@\S+)/m)?.[1];
    if (!to) continue;
    const site = await json(path.join(root, 'demos', slug, 'site.json'), {});
    out.push({ slug, to, name: site.name ?? slug, state: stateOf(site), text: mail, lead: { email: to, name: site.name, website: site.website } });
  }
  return out;
}

async function live(url) {
  try { return (await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) })).ok; } catch { return null; }
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  const config = await json(path.join(root, 'config.json'), {});
  const mailboxes = config.sending?.mailboxes ?? [];
  const sent = await json(SENT, []);
  const dnc = (await json(path.join(root, 'do-not-contact.json'), { entries: [] })).entries;

  if (args.includes('--status')) {
    for (const b of mailboxes) console.log(`${b.address}: ${sent.filter((s) => s.from === b.address).length} sent, ${dailyLimit(b)} a day now${b.start ? '' : ' (no start date yet: not sending)'}`);
    console.log(`${sent.length} emails sent in all.`);
    return;
  }

  if (arg('record')) {
    const slug = arg('record');
    const from = arg('from');
    if (!mailboxes.some((b) => b.address === from) || /@neonsignsites\.com$/i.test(from ?? '')) throw new Error(`--from must be one of the sending mailboxes in config.json (never neonsignsites.com).`);
    const r = (await readyPreviews()).find((p) => p.slug === slug);
    if (!r) throw new Error(`No email draft in demos/${slug}/email.txt.`);
    if (sent.some((s) => s.slug === slug || s.to.toLowerCase() === r.to.toLowerCase())) throw new Error(`${slug} (${r.to}) was already emailed: one email per business.`);
    if (blocked(r.lead, dnc)) throw new Error(`${slug} is on the do-not-contact list.`);
    sent.push({ date: today(), slug, to: r.to, from, subject: r.text.match(/^Subject: *(.*)$/m)?.[1] ?? '' });
    await writeFile(SENT, JSON.stringify(sent, null, 1) + '\n');
    console.log(`Recorded: ${slug} → ${r.to} from ${from}. Commit leads/sent.json.`);
    return;
  }

  if (args.includes('--plan')) {
    if (!config.sender?.address) throw new Error('No postal address in config.json (sender.address): US law (CAN-SPAM) requires it in every email. No plan until it is set.');
    if (!mailboxes.length) throw new Error('No sending mailboxes in config.json (sending.mailboxes).');
    const replies = (await json(path.join(root, 'leads', 'replies.json'), { replies: [] })).replies ?? [];
    const readyList = await readyPreviews();
    const { out, skipped, room } = plan({ ready: readyList, sent, mailboxes, dnc, mx: await json(MX_FILE, {}), replies });
    const lines = [`# Emails for ${today()}: for Alon's approval`, '', 'Nothing has been sent. Alon approves the list as a whole ("go", or "go, skip #4"); then `npm run send -- --approve [--skip 4]` and `npm run send` send exactly these texts.', ''];
    const emails = [];
    const sites = await websites();
    for (const b of room) lines.push(`- ${b.address}: ${b.left + out.filter((o) => o.from === b.address).length} allowed today`);
    lines.push('');
    for (const o of out) {
      if (o.kind === 'followup') {
        const site = await json(path.join(root, 'demos', o.slug, 'site.json'), {});
        o.name = site.name ?? o.slug;
        o.state = stateOf(site);
        const flink = `https://neonsignsites.com/p/${o.slug}/`;
        o.text = `To: ${o.to}\nSubject: Re: ${o.firstSubject ?? `${o.name} – new website (preview)`}\n\n${followupBody({ name: o.name, link: flink, sender: config.sender })}`;
        const up = await live(flink);
        const n = emails.length + 1;
        emails.push({ n, kind: 'followup', slug: o.slug, name: o.name, to: o.to, from: o.from, threadId: o.threadId, firstMessageId: o.firstMessageId, state: o.state, tz: zoneOf(o.state), text: o.text.trim() + '\n', link: flink, linkLive: up });
        lines.push(`## ${n}. Follow-up: ${o.name} → ${o.to} (from ${o.from}, same thread; ${o.state ?? '?'}, from 8:00 their time)`, '', up === false ? '**The preview link does not open. It will not be sent.**\n' : '', '```', o.text.trim(), '```', '');
        continue;
      }
      o.text = refreshSignature(rewordDraft(o.text, config.sender) ?? o.text, config.sender);
      // Subject A/B test: alternate by position; the reply rate per variant decides (npm run replies reports it).
      const variant = (emails.filter((e) => e.kind !== 'followup').length % 2) ? 'B' : 'A';
      o.text = o.text.replace(/^Subject: .*$/m, `Subject: ${subjectFor(variant, { name: o.name, domain: bare(sites[o.to.toLowerCase()]) })}`);
      o.variant = variant;
      if (o.text.includes('[POSTAL ADDRESS')) throw new Error(`${o.slug}: the draft has no postal address in its signature. Fix demos/${o.slug}/email.txt.`);
      const link = o.text.match(/https:\/\/neonsignsites\.com\/p\/[^\s]+/)?.[0];
      const up = link ? await live(link) : null;
      const n = emails.length + 1;
      emails.push({ n, slug: o.slug, name: o.name, to: o.to, from: o.from, variant: o.variant, version: EMAIL_VERSION, state: o.state, tz: zoneOf(o.state), text: o.text.trim() + '\n', link, linkLive: up });
      lines.push(`## ${n}. ${o.name} → ${o.to} (from ${o.from}; ${o.state ?? '?'}, sent from 8:00 their time; subject ${o.variant})`, '', up === false ? '**The preview link does not open yet (not on main?). It will not be sent.**\n' : '', '```', o.text.trim(), '```', '');
    }
    if (skipped.length) lines.push('Left out:', ...skipped.map((s) => `- ${s}`), '');
    await mkdir(path.join(root, 'outbox'), { recursive: true });
    const file = path.join(root, 'outbox', `${today()}.md`);
    await writeFile(file, lines.join('\n') + '\n');
    await writeFile(file.replace(/\.md$/, '.json'), JSON.stringify({ date: today(), approved: null, emails }, null, 1) + '\n');
    console.log(`${out.length} emails planned for today (${out.filter((o) => o.kind === 'followup').length} follow-ups) → ${path.relative(root, file)} (for approval; nothing sent).`);
    return;
  }
  console.log('npm run queue -- --plan | --record <slug> --from <mailbox> | --status');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
