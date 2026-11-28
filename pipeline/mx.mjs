#!/usr/bin/env node
// Address check before sending: does the email's domain accept mail (MX record, or an A record as a fallback)?
// Bounces above ~2% push the mailboxes into spam, and a domain with no mail server always bounces.
//   npm run mx      checks every not-yet-emailed preview's address domain (and found-lead emails) and saves
//                   leads/mx.json { domain: { ok, checked } }. Uses DNS over HTTPS, so it works in any environment.
// npm run queue -- --plan leaves out any address whose domain is recorded as not accepting mail.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { promises as dns } from 'node:dns';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MX_FILE = path.join(root, 'leads', 'mx.json');
const json = (f, fallback) => readFile(f, 'utf8').then(JSON.parse).catch(() => fallback);
export const domainOf = (email) => String(email ?? '').split('@')[1]?.toLowerCase().trim() ?? '';
const BIG = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'live.com', 'msn.com', 'att.net', 'comcast.net', 'me.com']);

/** One DNS question over HTTPS (Cloudflare's resolver): works where plain DNS is blocked or answers
 *  MX queries with nothing (the cloud environments do; run with NODE_USE_ENV_PROXY=1 there). */
async function doh(name, type) {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`DNS over HTTPS: ${res.status}`);
  return res.json();
}

/** true: accepts mail, false: no mail server (NXDOMAIN, a null MX, or no MX and no A), null: could not tell. */
export async function acceptsMail(domain) {
  if (BIG.has(domain)) return true;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(domain)) return false;
  try {
    const mx = await doh(domain, 'MX');
    if (mx.Status === 3) return false;
    const hosts = (mx.Answer ?? []).filter((a) => a.type === 15).map((a) => a.data.split(' ')[1]);
    if (hosts.length) return hosts.some((h) => h && h !== '.');
    const a = await doh(domain, 'A');
    return (a.Answer ?? []).some((r) => r.type === 1);
  } catch { /* the resolver could not be reached */ }
  try { const mx = await dns.resolveMx(domain); if (mx.some((m) => m.exchange && m.exchange !== '.')) return true; } catch { /* plain DNS: no answer */ }
  return null;
}

/** Whether to leave an address out: only when its domain was checked and has no mail server. */
export const noMail = (email, mx) => mx[domainOf(email)]?.ok === false;

async function main() {
  const mx = await json(MX_FILE, {});
  const sent = new Set((await json(path.join(root, 'leads', 'sent.json'), [])).map((s) => s.slug));
  const emails = new Set();
  for (const slug of await readdir(path.join(root, 'demos'))) {
    if (sent.has(slug)) continue;
    const mail = await readFile(path.join(root, 'demos', slug, 'email.txt'), 'utf8').catch(() => null);
    const to = mail?.match(/^To: *(\S+@\S+)/m)?.[1];
    if (to) emails.add(to);
  }
  for (const f of await readdir(path.join(root, 'leads'))) {
    if (!/^found-.*\.json$/.test(f)) continue;
    const d = await json(path.join(root, 'leads', f), []);
    for (const l of Array.isArray(d) ? d : d.leads ?? []) if (l.email) emails.add(l.email);
  }
  const todo = [...new Set([...emails].map(domainOf))].filter((d) => d && !mx[d]);
  let bad = 0, unknown = 0;
  for (const d of todo) {
    const ok = await acceptsMail(d);
    if (ok === null) { unknown++; continue; }
    mx[d] = { ok, checked: new Date().toISOString().slice(0, 10) };
    if (!ok) { bad++; console.log(`no mail server: ${d}`); }
  }
  await writeFile(MX_FILE, JSON.stringify(Object.fromEntries(Object.entries(mx).sort()), null, 1) + '\n');
  console.log(`${todo.length} domains checked: ${bad} without a mail server, ${unknown} could not be checked (DNS). Commit leads/mx.json.`);
  if (unknown === todo.length && todo.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
