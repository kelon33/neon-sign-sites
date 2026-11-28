#!/usr/bin/env node
// What gets replies: reply rate by trade, state, site kind, Google rating and review count, from
// leads/sent.json (first emails), leads/replies.json (a real reply, a site form or a payment counts; "no" and
// bounces don't) and the lead data in leads/found-*.json. Shown on the dashboard; the daily runs build and
// send the best groups first once each has at least MIN_SENT emails.
//   npm run stats

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (f, fallback) => readFile(f, 'utf8').then(JSON.parse).catch(() => fallback);
export const MIN_SENT = 30;

const band = (x, edges, labels) => { for (let i = 0; i < edges.length; i++) if (x < edges[i]) return labels[i]; return labels.at(-1); };

/** { dimension: [{ key, sent, replied, rate }] }, best rate first. Exported for tests. */
export function replyStats({ sent, replies, leads }) {
  const good = new Set(replies.filter((r) => ['reply', 'site-form', 'payment'].includes(r.kind)).map((r) => r.slug));
  const byEmail = Object.fromEntries(leads.filter((l) => l.email).map((l) => [l.email.toLowerCase(), l]));
  const dims = { trade: {}, state: {}, site: {}, rating: {}, reviews: {} };
  for (const s of sent.filter((x) => x.kind !== 'followup')) {
    const l = byEmail[s.to?.toLowerCase()] ?? {};
    const keys = {
      trade: l.trade ?? 'unknown',
      state: (l.city ?? l.address ?? '').match(/,\s*([A-Z]{2})\b/)?.[1] ?? 'unknown',
      site: l.kind ?? 'unknown',
      rating: l.rating ? band(Number(l.rating), [4.5, 4.8], ['under 4.5', '4.5–4.7', '4.8–5.0']) : 'unknown',
      reviews: l.reviews ? band(Number(l.reviews), [20, 100, 300], ['under 20', '20–99', '100–299', '300+']) : 'unknown',
    };
    for (const [d, k] of Object.entries(keys)) {
      const g = (dims[d][k] ??= { key: k, sent: 0, replied: 0 });
      g.sent++; if (good.has(s.slug)) g.replied++;
    }
  }
  return Object.fromEntries(Object.entries(dims).map(([d, groups]) => [d, Object.values(groups)
    .map((g) => ({ ...g, rate: g.sent ? g.replied / g.sent : 0 }))
    .sort((a, b) => b.rate - a.rate || b.sent - a.sent)]));
}

export async function loadStats() {
  const sent = await json(path.join(root, 'leads', 'sent.json'), []);
  const replies = (await json(path.join(root, 'leads', 'replies.json'), { replies: [] })).replies ?? [];
  const leads = [];
  for (const f of await readdir(path.join(root, 'leads')).catch(() => [])) {
    if (!/^found-.*\.json$/.test(f)) continue;
    const d = await json(path.join(root, 'leads', f), []);
    leads.push(...(Array.isArray(d) ? d : d.leads ?? []));
  }
  return replyStats({ sent, replies, leads });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const st = await loadStats();
  for (const [d, groups] of Object.entries(st)) console.log(`${d}: ` + groups.map((g) => `${g.key} ${g.replied}/${g.sent}${g.sent >= MIN_SENT ? ` (${Math.round(100 * g.rate)}%)` : ''}`).join(' · '));
}
