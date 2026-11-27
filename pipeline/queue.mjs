#!/usr/bin/env node
// Plans each day's cold emails for Alon's approval, and keeps the record of what was sent.
// It never sends anything.
//   npm run queue -- --plan                    today's list: outbox/<date>.md, every email in full, for approval
//   npm run queue -- --record <slug> --from alon@neonsignsites.net    after an email was sent (approved)
//   npm run queue -- --status                  sent so far, per mailbox
//
// Rules it enforces (CLAUDE.md): never from neonsignsites.com; a daily limit per mailbox that ramps
// up with its age (7 a day in week 1, 10 from week 2, more only when Alon raises it in config.json);
// the do-not-contact list checked again at planning time and at recording time; one email per
// business, ever; no plan at all while config.json has no postal address (CAN-SPAM).

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blocked } from './dnc.mjs';
import { refreshSignature } from './email.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SENT = path.join(root, 'leads', 'sent.json');
const today = () => new Date().toISOString().slice(0, 10);

/** How many emails a mailbox may send on a day: its ramp by week since it started, capped by max. */
export function dailyLimit(box, day = today()) {
  if (/@neonsignsites\.com$/i.test(box.address)) return 0; // the brand domain never sends cold email
  if (!box.start || day < box.start) return 0;
  const week = Math.floor((Date.parse(day) - Date.parse(box.start)) / (7 * 864e5));
  const ramp = box.ramp ?? [7, 10];
  return Math.min(ramp[Math.min(week, ramp.length - 1)], box.max ?? Infinity);
}

/** The emails for today: each ready preview once, across the mailboxes' remaining room. */
export function plan({ ready, sent, mailboxes, dnc, day = today() }) {
  const done = new Set(sent.flatMap((s) => [s.slug, s.to?.toLowerCase()]));
  const room = mailboxes.map((b) => ({ address: b.address, left: dailyLimit(b, day) - sent.filter((s) => s.from === b.address && s.date === day).length }));
  const out = [];
  const skipped = [];
  for (const r of ready) {
    if (done.has(r.slug) || done.has(r.to.toLowerCase())) continue;
    const no = blocked(r.lead ?? { email: r.to, name: r.name }, dnc);
    if (no) { skipped.push(`${r.slug}: on the do-not-contact list`); continue; }
    const box = room.reduce((best, b) => (b.left > (best?.left ?? 0) ? b : best), null); // spread evenly: the box with the most room
    if (!box) break;
    box.left--;
    out.push({ ...r, from: box.address });
  }
  return { out, skipped, room };
}

async function json(file, fallback) { return readFile(file, 'utf8').then(JSON.parse).catch(() => fallback); }

/** Previews with an email draft: demos/<slug>/email.txt, To: line and all. */
async function readyPreviews() {
  const out = [];
  for (const slug of (await readdir(path.join(root, 'demos'))).sort()) {
    const mail = await readFile(path.join(root, 'demos', slug, 'email.txt'), 'utf8').catch(() => null);
    const to = mail?.match(/^To: *(\S+@\S+)/m)?.[1];
    if (!to) continue;
    const site = await json(path.join(root, 'demos', slug, 'site.json'), {});
    out.push({ slug, to, name: site.name ?? slug, text: mail, lead: { email: to, name: site.name, website: site.website } });
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
    const { out, skipped, room } = plan({ ready: await readyPreviews(), sent, mailboxes, dnc });
    const lines = [`# Emails for ${today()}: for Alon's approval`, '', 'Nothing has been sent yet. `npm run send -- --approve [--skip 4]` and `npm run send` send exactly these texts.', ''];
    const emails = [];
    for (const b of room) lines.push(`- ${b.address}: ${b.left + out.filter((o) => o.from === b.address).length} allowed today`);
    lines.push('');
    for (const o of out) {
      o.text = refreshSignature(o.text, config.sender);
      if (o.text.includes('[POSTAL ADDRESS')) throw new Error(`${o.slug}: the draft has no postal address in its signature. Fix demos/${o.slug}/email.txt.`);
      const link = o.text.match(/https:\/\/neonsignsites\.com\/p\/[^\s]+/)?.[0];
      const up = link ? await live(link) : null;
      const n = emails.length + 1;
      emails.push({ n, slug: o.slug, name: o.name, to: o.to, from: o.from, text: o.text.trim() + '\n', link, linkLive: up });
      lines.push(`## ${n}. ${o.name} → ${o.to} (from ${o.from})`, '', up === false ? '**The preview link does not open yet (not on main?). It will not be sent.**\n' : '', '```', o.text.trim(), '```', '');
    }
    if (skipped.length) lines.push('Left out:', ...skipped.map((s) => `- ${s}`), '');
    await mkdir(path.join(root, 'outbox'), { recursive: true });
    const file = path.join(root, 'outbox', `${today()}.md`);
    await writeFile(file, lines.join('\n') + '\n');
    await writeFile(file.replace(/\.md$/, '.json'), JSON.stringify({ date: today(), approved: null, emails }, null, 1) + '\n');
    console.log(`${out.length} emails planned for today → ${path.relative(root, file)} (for approval; nothing sent).`);
    return;
  }
  console.log('npm run queue -- --plan | --record <slug> --from <mailbox> | --status');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
