#!/usr/bin/env node
// Checks all six sending mailboxes for new replies, so Alon doesn't have to sign in to each.
//   npm run replies            new mail since the last check → leads/replies.json, printed for Alon
//
// Every new message in a sending mailbox's inbox is recorded, matched to the email we sent (by thread or
// address). A clear "no" / unsubscribe goes on do-not-contact.json at once (CAN-SPAM: same day, never
// removed). Bounces are marked. Nothing is ever answered from here: Alon and Claude decide each answer.

import { EMAIL_VERSION } from './email.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenVar } from './send.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(root, 'leads', 'replies.json');
const DNC = path.join(root, 'do-not-contact.json');
const json = (file, fallback) => readFile(file, 'utf8').then(JSON.parse).catch(() => fallback);
const FREE_MAIL = /@(gmail|yahoo|hotmail|outlook|aol|icloud|live|msn)\.com$/i;

/** What a reply is: 'no' (opt-out), 'bounce', or 'reply'. */
export function kind({ from, subject = '', text = '' }) {
  if (/mailer-daemon|postmaster|mail delivery/i.test(from) || /undeliverable|delivery status notification|returned mail|failure notice/i.test(subject)) return 'bounce';
  const first = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('>')).slice(0, 3).join(' ');
  if (/^unsubscribe$/i.test(subject.trim()) || /^(no|nope|stop|unsubscribe|remove( me)?|not interested|no thanks?( you)?|take me off)[\s.!,]*($|please|thanks|thank you)/i.test(first)) return 'no';
  if (/\b(unsubscribe|remove me|stop emailing|do not (email|contact)|don'?t (email|contact)|take me off)\b/i.test(first)) return 'no';
  return 'reply';
}

const address = (from) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();

function plainText(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return Buffer.from(payload.body.data, 'base64url').toString('utf8');
  for (const p of payload.parts ?? []) { const t = plainText(p); if (t) return t; }
  if (payload.body?.data) return Buffer.from(payload.body.data, 'base64url').toString('utf8').replace(/<[^>]+>/g, ' ');
  return '';
}

async function token(box) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.NEON_GMAIL_CLIENT_ID, client_secret: process.env.NEON_GMAIL_CLIENT_SECRET, refresh_token: process.env[tokenVar(box)] ?? '', grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Gmail sign-in failed for ${box}: ${j.error ?? r.status}`);
  return j.access_token;
}

async function main() {
  const config = await json(path.join(root, 'config.json'), {});
  const boxes = (config.sending?.mailboxes ?? []).map((b) => b.address);
  const store = await json(FILE, { about: 'Replies found in the sending mailboxes by npm run replies. kind: reply, no (added to do-not-contact.json), bounce, site-form (a Make it live or preview request from the site).', checked: {}, replies: [] });
  const sent = await json(path.join(root, 'leads', 'sent.json'), []);
  const dnc = await json(DNC, { entries: [] });
  const seen = new Set(store.replies.map((r) => r.id));
  const fresh = [];
  for (const box of boxes) {
    const auth = { authorization: `Bearer ${await token(box)}` };
    const since = Math.floor(Date.parse(store.checked[box] ?? '2026-11-27T00:00:00Z') / 1000) - 3600;
    const startedAt = new Date().toISOString();
    const list = await (await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=${encodeURIComponent(`(in:inbox OR in:spam) after:${since} -from:me`)}&includeSpamTrash=true`, { headers: auth })).json();
    for (const { id } of list.messages ?? []) {
      if (seen.has(id)) continue;
      const m = await (await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: auth })).json();
      const h = Object.fromEntries((m.payload?.headers ?? []).map((x) => [x.name.toLowerCase(), x.value]));
      const from = h.from ?? '';
      const text = plainText(m.payload).trim();
      const ours = sent.find((s) => s.threadId === m.threadId) ?? sent.find((s) => s.to?.toLowerCase() === address(from));
      const dom = address(from).split('@')[1];
      // Ours if: same thread, the address or company domain we wrote to, or it quotes one of our preview
      // links or subjects (an owner answering from another address, e.g. a personal Gmail).
      const linkSlug = text.match(/neonsignsites\.com\/p\/([a-z0-9-]+)/)?.[1];
      const subj = (h.subject ?? '').replace(/^(re|fwd?|aw):\s*/gi, '').trim().toLowerCase();
      const match = ours ?? sent.find((s) => !FREE_MAIL.test(s.to ?? '') && s.to?.toLowerCase().endsWith('@' + dom))
        ?? (linkSlug && sent.find((s) => s.slug === linkSlug))
        ?? (subj.length > 8 && sent.find((s) => s.subject && s.subject.toLowerCase() === subj));
      const k = kind({ from, subject: h.subject, text });
      // Only mail about our cold emails counts: same thread, the address or company domain we wrote to,
      // or a bounce of one of ours. Everything else (warm-up traffic, newsletters) is left alone.
      // The site's forms (hello@neonsignsites.com → alon@neonsignsites.com, delivered to alon@neonsignsites.net):
      // a preview request or a "Make it live" is a hot lead too.
      const site = /hello@neonsignsites\.com/i.test(from) && /^(Make it live|Preview request|Payment received):/i.test(h.subject ?? '') && !/TEST by Claude/.test(h.subject ?? '');
      const paid = site && /^Payment received:/i.test(h.subject ?? '');
      if (!match && !site && !(k === 'bounce' && sent.some((s) => text.toLowerCase().includes(s.to?.toLowerCase())))) { seen.add(id); continue; }
      const inSpam = (m.labelIds ?? []).includes('SPAM');
      const r = { id, threadId: m.threadId, box, from, ...(inSpam ? { inSpam: true } : {}), subject: h.subject ?? '', date: new Date(Number(m.internalDate)).toISOString(), slug: match?.slug ?? (paid ? (text.match(/^Slug: *([a-z0-9-]+)/m)?.[1] ?? null) : null), kind: paid ? 'payment' : site ? 'site-form' : k, messageId: h['message-id'] ?? null, text: text.slice(0, 4000) };
      if (r.kind === 'no' && !site) {
        const email = address(from);
        const domain = !FREE_MAIL.test(email) ? email.split('@')[1] : undefined;
        if (!dnc.entries.some((e) => e.email?.toLowerCase() === email)) dnc.entries.push({ email, ...(domain ? { domain } : {}), ...(match?.slug ? { name: match.slug } : {}), date: r.date.slice(0, 10), reason: `replied "${text.split('\n')[0].slice(0, 60)}" to ${box}` });
      }
      store.replies.push(r); seen.add(id); fresh.push(r);
    }
    store.checked[box] = startedAt;
  }
  await writeFile(FILE, JSON.stringify(store, null, 1) + '\n');
  await writeFile(DNC, JSON.stringify(dnc, null, 1) + '\n');
  // Subject A/B test: replies (not "no", not bounces) per variant, counting only sends of the current email
  // wording (EMAIL_VERSION): a new body restarts the test.
  const cur = sent.filter((x) => x.version === EMAIL_VERSION);
  const ab = ['A', 'B'].map((v) => { const n = cur.filter((x) => x.variant === v).length; const r = new Set(store.replies.filter((x) => x.kind === 'reply' && cur.find((y) => y.slug === x.slug)?.variant === v).map((x) => x.slug)).size; return `${v}: ${r}/${n} replied${n ? ` (${Math.round((100 * r) / n)}%)` : ''}`; });
  const abLine = `Subject test: ${ab.join(', ')}.`;
  if (!fresh.length) { console.log(`No new replies. ${abLine}`); return; }
  for (const r of fresh) {
    console.log(`\n### ${r.kind === 'no' ? 'NO (added to do-not-contact)' : r.kind === 'bounce' ? 'BOUNCE' : r.kind === 'payment' ? 'PAYMENT (launch the site)' : r.kind === 'site-form' ? 'SITE FORM (hot lead)' : 'REPLY'}${r.inSpam ? ' (was in the spam folder)' : ''}: ${r.from} → ${r.box}${r.slug ? ` (preview: ${r.slug})` : ''}\nSubject: ${r.subject}\n${r.date}\n\n${r.text.split(/\n(On .+wrote:|-----Original Message-----)/)[0].trim().slice(0, 1500)}`);
  }
  console.log(`\n${fresh.length} new: ${fresh.filter((r) => r.kind === 'reply').length} replies, ${fresh.filter((r) => r.kind === 'no').length} no, ${fresh.filter((r) => r.kind === 'bounce').length} bounces. Commit leads/replies.json and do-not-contact.json.\n${abLine}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
