// Alon's private dashboard: neonsignsites.com/dashboard, behind Cloudflare Access (only his email).
// Built by deploy.mjs on every push to main, from the repo's own records: leads/sent.json (what went
// out), leads/replies.json (replies, bounces, site forms), do-not-contact.json, demos/ (previews).
// The daily runs and the 2-hourly reply checks push those files, so the page refreshes with them.
// worker.js refuses /dashboard on any host but neonsignsites.com and without the Access header.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const json = (f, fallback) => readFile(f, 'utf8').then(JSON.parse).catch(() => fallback);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const day = (iso) => String(iso ?? '').slice(0, 10);

/** Every business we emailed (or that wrote in through the site), with its status. Exported for tests. */
export function pipeline({ sent, replies, dnc, names = {} }) {
  const rows = new Map();
  for (const s of sent) rows.set(s.slug, { slug: s.slug, name: names[s.slug] ?? s.slug, to: s.to, from: s.from, variant: s.variant ?? null, sentOn: day(s.sentAt ?? s.date), status: 'cold', last: null });
  const rank = { 'site-form': 5, reply: 4, no: 2, bounce: 1 };
  for (const r of replies) {
    if (!r.slug) continue;
    const row = rows.get(r.slug) ?? { slug: r.slug, name: names[r.slug] ?? r.slug, to: null, from: null, variant: null, sentOn: null, status: 'cold', last: null };
    const now = { 'site-form': 'hot-form', reply: 'hot-reply', no: 'no', bounce: 'bounced' }[r.kind] ?? row.status;
    const cur = { 'hot-form': 5, 'hot-reply': 4, no: 2, bounced: 1, cold: 0 }[row.status];
    if ((rank[r.kind] ?? 0) >= cur) { row.status = now; row.last = r; }
    rows.set(r.slug, row);
  }
  for (const row of rows.values()) {
    if (row.status === 'cold' && dnc.some((e) => e.email && row.to && e.email.toLowerCase() === row.to.toLowerCase())) row.status = 'no';
  }
  return [...rows.values()];
}

export async function buildDashboard(root) {
  const sent = await json(path.join(root, 'leads', 'sent.json'), []);
  const replies = (await json(path.join(root, 'leads', 'replies.json'), { replies: [] })).replies ?? [];
  const dnc = (await json(path.join(root, 'do-not-contact.json'), { entries: [] })).entries ?? [];
  const usage = await json(path.join(root, 'leads', 'places-usage.json'), { months: {} });
  const names = {};
  let ready = 0;
  const emailed = new Set(sent.map((s) => s.slug));
  for (const slug of await readdir(path.join(root, 'demos')).catch(() => [])) {
    const site = await json(path.join(root, 'demos', slug, 'site.json'), null);
    if (site?.name) names[slug] = site.name;
    const mail = await readFile(path.join(root, 'demos', slug, 'email.txt'), 'utf8').catch(() => null);
    if (mail && /^To: *\S+@/m.test(mail) && !emailed.has(slug)) ready++;
  }
  const rows = pipeline({ sent, replies, dnc, names });
  const count = (st) => rows.filter((r) => r.status === st).length;
  const hot = rows.filter((r) => r.status.startsWith('hot')).sort((a, b) => String(b.last?.date).localeCompare(String(a.last?.date)));
  const realReplies = new Set(replies.filter((r) => r.kind === 'reply' || r.kind === 'site-form').map((r) => r.slug)).size;
  const delivered = sent.length - count('bounced');
  const rate = delivered ? Math.round((100 * realReplies) / delivered) : 0;
  const perDay = {};
  for (const s of sent) perDay[day(s.sentAt ?? s.date)] = (perDay[day(s.sentAt ?? s.date)] ?? 0) + 1;
  const days = Object.keys(perDay).sort().slice(-14);
  const max = Math.max(1, ...days.map((d) => perDay[d]));
  const ab = ['A', 'B'].map((v) => {
    const n = sent.filter((s) => s.variant === v).length;
    const r = new Set(replies.filter((x) => x.kind === 'reply' && sent.find((s) => s.slug === x.slug)?.variant === v).map((x) => x.slug)).size;
    return { v, n, r, pct: n ? Math.round((100 * r) / n) : 0 };
  });
  const month = new Date().toISOString().slice(0, 7);
  const places = usage.months?.[month]?.requests ?? 0;
  const label = { 'hot-form': 'Make it live / form', 'hot-reply': 'Replied', cold: 'No reaction yet', no: 'Said no', bounced: 'Bounced' };
  const preview = (slug) => `<a href="/p/${esc(slug)}/" target="_blank" rel="noopener">${esc(names[slug] ?? slug)}</a>`;
  const quote = (r) => r?.text ? `<q>${esc(r.text.split(/\n(On .+wrote:|-----Original Message-----)/)[0].trim().slice(0, 220))}</q>` : '';
  const table = (list) => list.length ? `<table><thead><tr><th>Business</th><th>Status</th><th>Emailed</th><th>From</th><th>Subj.</th></tr></thead><tbody>${list.map((r) =>
    `<tr class="${esc(r.status)}"><td>${preview(r.slug)}<small>${esc(r.to ?? '')}</small></td><td><span class="tag ${esc(r.status)}">${esc(label[r.status])}</span></td><td>${esc(r.sentOn ?? '')}</td><td>${esc((r.from ?? '').replace('@neonsignsites.', ' @ .'))}</td><td>${esc(r.variant ?? '–')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing here yet.</p>';
  const order = { 'hot-form': 0, 'hot-reply': 1, cold: 2, no: 3, bounced: 4 };
  const all = [...rows].sort((a, b) => order[a.status] - order[b.status] || String(b.sentOn).localeCompare(String(a.sentOn)));
  const built = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Dashboard | Neon Sign Sites</title>
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<style>
:root { --bg: #0b0b10; --card: #15151d; --line: #26262f; --fg: #f2f0f5; --muted: #9a97a6; --pink: #ff4f8b; --gold: #ffd27a; --green: #5fd39a; }
* { box-sizing: border-box; }
body { margin: 0; background: radial-gradient(ellipse 90% 40% at 50% 0%, rgba(255,79,139,.10), transparent 70%), var(--bg); color: var(--fg); font: 400 15px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; }
.wrap { max-width: 1100px; margin: 0 auto; padding: 24px 16px 60px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
header img { height: 28px; vertical-align: middle; margin-right: 8px; }
h1 { font-size: 1.3rem; margin: 0; } h2 { font-size: 1.05rem; margin: 34px 0 12px; }
.muted, small { color: var(--muted); } small { display: block; font-size: .8rem; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 20px; }
.kpi { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; }
.kpi b { display: block; font-size: 1.9rem; line-height: 1.1; } .kpi span { color: var(--muted); font-size: .85rem; }
.kpi.hot b { color: var(--pink); text-shadow: 0 0 18px rgba(255,79,139,.45); } .kpi.money b { color: var(--green); }
.cols { display: grid; grid-template-columns: 1.2fr .8fr; gap: 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px; overflow-x: auto; }
.lead { padding: 12px 0; border-top: 1px solid var(--line); } .lead:first-child { border-top: 0; padding-top: 0; }
q { display: block; color: var(--fg); opacity: .85; margin-top: 4px; font-style: italic; }
.bars { display: flex; align-items: flex-end; gap: 6px; height: 120px; margin-top: 8px; }
.bars div { flex: 1; background: linear-gradient(180deg, var(--pink), rgba(255,79,139,.35)); border-radius: 6px 6px 2px 2px; position: relative; min-width: 14px; }
.bars div span { position: absolute; top: -18px; left: 0; right: 0; text-align: center; font-size: .75rem; color: var(--muted); }
.bars-x { display: flex; gap: 6px; font-size: .7rem; color: var(--muted); } .bars-x span { flex: 1; text-align: center; min-width: 14px; }
table { width: 100%; border-collapse: collapse; font-size: .9rem; } th, td { text-align: left; padding: 9px 8px; border-top: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 500; border-top: 0; }
a { color: #ff8fb4; text-decoration: none; } a:hover { text-decoration: underline; }
.tag { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: .78rem; white-space: nowrap; background: #22222c; color: var(--muted); }
.tag.hot-form, .tag.hot-reply { background: rgba(255,79,139,.18); color: #ff9cbf; } .tag.no { background: #2a1d1d; color: #e59a9a; } .tag.bounced { background: #2a2618; color: var(--gold); }
@media (max-width: 760px) { .cols { grid-template-columns: 1fr; } td:nth-child(4), th:nth-child(4) { display: none; } }
</style></head><body><div class="wrap">
<header><h1><img src="/logo.svg" alt="">Dashboard</h1><span class="muted">Updated ${esc(built)}</span></header>

<div class="kpis">
  <div class="kpi hot"><b>${hot.length}</b><span>Hot leads</span></div>
  <div class="kpi"><b>${count('cold')}</b><span>Cold (no reaction yet)</span></div>
  <div class="kpi"><b>${sent.length}</b><span>Emails sent · ${esc(perDay[day(new Date().toISOString())] ?? 0)} today</span></div>
  <div class="kpi"><b>${rate}%</b><span>Reply rate (${realReplies} of ${delivered} delivered)</span></div>
  <div class="kpi"><b>${ready}</b><span>Previews ready to send</span></div>
  <div class="kpi money"><b>–</b><span>Revenue (PayPal not connected yet)</span></div>
</div>

<div class="cols">
  <div><h2>Hot leads</h2><div class="card">${hot.length ? hot.map((r) => `<div class="lead">${preview(r.slug)} <span class="tag ${esc(r.status)}">${esc(label[r.status])}</span><small>${esc(r.last?.from ?? '')} → ${esc(r.last?.box ?? '')} · ${esc(day(r.last?.date))}</small>${quote(r.last)}</div>`).join('') : '<p class="muted">No replies or "Make it live" yet. They appear here within 2 hours, and you get a notification.</p>'}</div></div>
  <div><h2>Emails per day</h2><div class="card">${days.length ? `<div class="bars">${days.map((d) => `<div style="height:${Math.round((100 * perDay[d]) / max)}%"><span>${perDay[d]}</span></div>`).join('')}</div><div class="bars-x">${days.map((d) => `<span>${esc(d.slice(5))}</span>`).join('')}</div>` : '<p class="muted">Nothing sent yet.</p>'}
  <h2 style="margin-top:22px">Subject test</h2>${ab.map((x) => `<p>${x.v === 'A' ? '<b>A</b> "Name – new website (preview)"' : '<b>B</b> "Quick question about their-site.com"'}<br><span class="muted">${x.r} replies of ${x.n} sent (${x.pct}%)</span></p>`).join('')}
  <p class="muted">Said no: ${count('no')} · Bounced: ${count('bounced')} · Do-not-contact list: ${dnc.length}<br>Google Places this month: ${esc(places)} of 600 requests</p></div></div>
</div>

<h2>Every business</h2><div class="card">${table(all)}</div>
<p class="muted" style="margin-top:20px">Coming next: preview visits, "Make it live" clicks, calls to (888) 444-1847 and PayPal payments.</p>
</div></body></html>
`;
}
