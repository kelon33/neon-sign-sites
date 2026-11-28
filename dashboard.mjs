// Alon's private dashboard: neonsignsites.com/dashboard, behind Cloudflare Access (only his email).
// Built by deploy.mjs on every push to main, from the repo's own records: leads/sent.json (what went
// out), leads/replies.json (replies, bounces, site forms), do-not-contact.json, demos/ (previews).
// The daily runs and the 2-hourly reply checks push those files, so the page refreshes with them.
// worker.js refuses /dashboard on any host but neonsignsites.com and without the Access header.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { loadStats, MIN_SENT } from './pipeline/stats.mjs';
import { EMAIL_VERSION } from './pipeline/email.mjs';

const json = (f, fallback) => readFile(f, 'utf8').then(JSON.parse).catch(() => fallback);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }) : ''); // dates in Israel time

/** Every business we emailed (or that wrote in through the site), with its status. Exported for tests. */
export function pipeline({ sent, replies, dnc, names = {} }) {
  const rows = new Map();
  const followed = new Set();
  for (const s of sent.filter((x) => x.kind === 'followup')) followed.add(s.slug);
  for (const s of sent.filter((x) => x.kind !== 'followup')) rows.set(s.slug, { slug: s.slug, name: names[s.slug] ?? s.slug, to: s.to, from: s.from, variant: s.variant ?? null, sentOn: day(s.sentAt ?? s.date), status: 'cold', last: null });
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
  for (const r of rows.values()) r.followedUp = followed.has(r.slug);
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
  // Phone numbers of every business (their preview's and Google's), so calls and texts to (888) 444-1847 match a lead.
  const phones = {};
  const ten = (n) => String(n ?? '').replace(/\D/g, '').slice(-10);
  for (const slug of Object.keys(names)) {
    const site = await json(path.join(root, 'demos', slug, 'site.json'), {});
    if (ten(site.phone).length === 10) phones[ten(site.phone)] = slug;
  }
  for (const f of await readdir(path.join(root, 'leads')).catch(() => [])) {
    if (!f.startsWith('found-') || !f.endsWith('.json')) continue;
    const d = await json(path.join(root, 'leads', f), []);
    const list = Array.isArray(d) ? d : d.leads ?? [];
    for (const l of list) { const s2 = sent.find((x) => x.to?.toLowerCase() === l.email?.toLowerCase()); if (s2 && ten(l.phone).length === 10 && !phones[ten(l.phone)]) phones[ten(l.phone)] = s2.slug; }
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
  const stats = await loadStats();
  const ab = ['A', 'B'].map((v) => {
    // Only sends of the current email wording: a new body restarts the subject test.
    const cur = sent.filter((s) => s.version === EMAIL_VERSION);
    const n = cur.filter((s) => s.variant === v).length;
    const r = new Set(replies.filter((x) => x.kind === 'reply' && cur.find((s) => s.slug === x.slug)?.variant === v).map((x) => x.slug)).size;
    return { v, n, r, pct: n ? Math.round((100 * r) / n) : 0 };
  });
  const month = new Date().toISOString().slice(0, 7);
  const places = usage.months?.[month]?.requests ?? 0;
  const cap = (await json(path.join(root, 'config.json'), {})).places?.monthlyRequestCap ?? 600;
  const label = { 'hot-form': 'Make it live / form', 'hot-reply': 'Replied', cold: 'No reaction yet', no: 'Said no', bounced: 'Bounced' };
  const preview = (slug) => `<a href="/p/${esc(slug)}/?me=1" target="_blank" rel="noopener">${esc(names[slug] ?? slug)}</a>`;
  const open = (slug) => `<a class="open" href="/p/${esc(slug)}/?me=1" target="_blank" rel="noopener">Preview ↗</a><small>neonsignsites.com/p/${esc(slug)}/</small>`;
  const quote = (r) => r?.text ? `<q>${esc(r.text.split(/\n(On .+wrote:|-----Original Message-----)/)[0].trim().slice(0, 220))}</q>` : '';
  const table = (list) => list.length ? `<table><thead><tr><th>Business</th><th>Preview</th><th>Status</th><th>Opened</th><th>Calls / texts</th><th>Emailed</th><th>From</th><th>Subj.</th></tr></thead><tbody>${list.map((r) =>
    `<tr class="${esc(r.status)}" data-slug="${esc(r.slug)}"><td>${preview(r.slug)}<small>${esc(r.to ?? '')}</small></td><td>${open(r.slug)}</td><td><span class="tag ${esc(r.status)}">${esc(label[r.status])}</span></td><td class="opened">–</td><td class="calls">–</td><td>${esc(r.sentOn ?? '')}${r.followedUp ? '<small>+ follow-up</small>' : ''}</td><td>${esc((r.from ?? '').replace('@neonsignsites.', ' @ .'))}</td><td>${esc(r.variant ?? '–')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing here yet.</p>';
  const order = { 'hot-form': 0, 'hot-reply': 1, cold: 2, no: 3, bounced: 4 };
  const all = [...rows].sort((a, b) => order[a.status] - order[b.status] || String(b.sentOn).localeCompare(String(a.sentOn)));
  // Every time on the dashboard is Israel time (Alon's), whatever the device's own time zone.
  const built = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' Israel time';

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
.lead.missed b { color: #ff9cbf; }
.lead { padding: 12px 0; border-top: 1px solid var(--line); } .lead:first-child { border-top: 0; padding-top: 0; }
q { display: block; color: var(--fg); opacity: .85; margin-top: 4px; font-style: italic; }
.bars { display: flex; align-items: flex-end; gap: 6px; height: 120px; margin-top: 8px; }
.bars div { flex: 1; background: linear-gradient(180deg, var(--pink), rgba(255,79,139,.35)); border-radius: 6px 6px 2px 2px; position: relative; min-width: 14px; }
.bars div span { position: absolute; top: -18px; left: 0; right: 0; text-align: center; font-size: .75rem; color: var(--muted); }
.bars-x { display: flex; gap: 6px; font-size: .7rem; color: var(--muted); } .bars-x span { flex: 1; text-align: center; min-width: 14px; }
table { width: 100%; border-collapse: collapse; font-size: .9rem; } th, td { text-align: left; padding: 9px 8px; border-top: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 500; border-top: 0; }
a { color: #ff8fb4; text-decoration: none; }
a.open { display: inline-block; padding: 4px 10px; border: 1px solid rgba(255,79,139,.45); border-radius: 99px; font-size: .82rem; white-space: nowrap; }
a.open:hover { background: rgba(255,79,139,.12); text-decoration: none; } a:hover { text-decoration: underline; }
.tag { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: .78rem; white-space: nowrap; background: #22222c; color: var(--muted); }
.tag.warm { background: rgba(255,210,122,.14); color: var(--gold); }
.tag.hot-form, .tag.hot-reply { background: rgba(255,79,139,.18); color: #ff9cbf; } .tag.no { background: #2a1d1d; color: #e59a9a; } .tag.bounced { background: #2a2618; color: var(--gold); }
@media (max-width: 760px) { .cols { grid-template-columns: 1fr; } td:nth-child(7), th:nth-child(7), td:nth-child(8), th:nth-child(8), td:nth-child(6), th:nth-child(6) { display: none; } td small { word-break: break-all; } }
</style></head><body><div class="wrap">
<header><h1><img src="/logo.svg" alt="">Dashboard</h1><span class="muted">Updated ${esc(built)}</span></header>

<div class="kpis">
  <div class="kpi hot"><b id="k-hot">${hot.length}</b><span>Hot leads</span></div>
  <div class="kpi"><b id="k-warm">…</b><span>Warm (opened their preview)</span></div>
  <div class="kpi"><b id="k-cold">${count('cold')}</b><span>Cold (no reaction yet)</span></div>
  <div class="kpi"><b>${sent.length}</b><span>Emails sent · ${esc(perDay[day(new Date().toISOString())] ?? 0)} today</span></div>
  <div class="kpi"><b>${rate}%</b><span>Reply rate (${realReplies} of ${delivered} delivered)</span></div>
  <div class="kpi"><b>${ready}</b><span>Previews ready to send</span></div>
  <div class="kpi money"><b id="k-rev">–</b><span id="k-rev-l">Revenue (PayPal not connected yet)</span></div>
</div>

<div id="calls"></div>

<div class="cols">
  <div><h2>Hot leads</h2><div class="card" id="hot-card">${hot.length ? hot.map((r) => `<div class="lead">${preview(r.slug)} <span class="tag ${esc(r.status)}">${esc(label[r.status])}</span> <a class="open" href="/p/${esc(r.slug)}/?me=1" target="_blank" rel="noopener">Preview ↗</a><small>${esc(r.last?.from ?? '')} → ${esc(r.last?.box ?? '')} · ${esc(day(r.last?.date))}</small>${quote(r.last)}</div>`).join('') : '<p class="muted">No replies or "Make it live" yet. They appear here within 2 hours, and you get a notification.</p>'}</div></div>
  <div><h2>Emails per day</h2><div class="card">${days.length ? `<div class="bars">${days.map((d) => `<div style="height:${Math.round((100 * perDay[d]) / max)}%"><span>${perDay[d]}</span></div>`).join('')}</div><div class="bars-x">${days.map((d) => `<span>${esc(d.slice(5))}</span>`).join('')}</div>` : '<p class="muted">Nothing sent yet.</p>'}
  <h2 style="margin-top:22px">Subject test</h2>${ab.map((x) => `<p>${x.v === 'A' ? '<b>A</b> "Name – new website (preview)"' : '<b>B</b> "Quick question about their-site.com"'}<br><span class="muted">${x.r} replies of ${x.n} sent (${x.pct}%)</span></p>`).join('')}
  <p class="muted" id="hooks-status"></p>
  <p class="muted">Said no: ${count('no')} · Bounced: ${count('bounced')} · Do-not-contact list: ${dnc.length}<br>Google Places this month: ${esc(places)} of ${esc(cap)} requests</p></div></div>
</div>

<h2>What gets replies</h2><div class="card"><p class="muted" style="margin-top:0">Replies, site forms and payments per first email (not "no" or bounces). A rate shows once a group has ${MIN_SENT} emails; the daily runs then build and send the best groups first.</p>${Object.entries({ trade: 'Trade', state: 'State', site: 'Their site', rating: 'Google rating', reviews: 'Google reviews' }).map(([d, label]) => `<p><b>${label}:</b> ${stats[d].map((g) => `${esc(g.key)} <span class="muted">${g.replied}/${g.sent}${g.sent >= MIN_SENT ? ` (${Math.round(100 * g.rate)}%)` : ''}</span>`).join(' · ') || '<span class="muted">nothing sent yet</span>'}</p>`).join('')}</div>

<h2>Every business</h2><div class="card">${table(all)}</div>
<p class="muted" style="margin-top:20px">Preview visits and "Make it live" clicks are live (from today; bots, link scanners and your own visits from any browser where you opened this dashboard are not counted). Calls and texts to (888) 444-1847 (Quo) and PayPal payments appear once their webhooks are set up.</p>
<script>
// Live numbers from the site itself (KV via /dashboard/api/events): who opened their preview, who opened "Make it live".
fetch('/dashboard/api/events', { credentials: 'same-origin' }).then((r) => r.json()).then((ev) => {
  let warm = 0, cold = 0;
  const when = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  for (const tr of document.querySelectorAll('tr[data-slug]')) {
    const s = tr.dataset.slug, p = ev.p[s], g = ev.g[s], m = ev.m[s];
    const cell = tr.querySelector('.opened');
    cell.innerHTML = p ? p.c + '× <small>last ' + when(p.l) + '</small>' : '–';
    if (p || g) cell.innerHTML += '<small><a href="#" class="forget" data-slug="' + s + '">that was me</a></small>';
    if (g && !m) cell.innerHTML += '<small>opened "Make it live"</small>';
    if (m) cell.innerHTML += '<small>sent "Make it live" (' + (m.plan || '?') + ')</small>';
    const tag = tr.querySelector('.tag');
    if (tr.classList.contains('cold') && (p || g)) { tag.className = 'tag warm'; tag.textContent = g ? 'Opened "Make it live"' : 'Opened preview'; warm++; }
    else if (tr.classList.contains('cold')) cold++;
  }
  // Calls and texts (Quo), matched to a business by phone number.
  const PHONES = ${JSON.stringify(phones)};
  const unknown = [];
  // A number that rang but has no completed call yet still counts as a call ("rang, not answered").
  for (const [num, m] of Object.entries(ev.r || {})) if (!(ev.c || {})[num]) { ev.c = ev.c || {}; ev.c[num] = { c: m.c, l: m.l, rang: true }; }
  for (const [num, kind] of [...Object.keys(ev.c || {}).map((n) => [n, 'c']), ...Object.keys(ev.s || {}).map((n) => [n, 's'])]) {
    const slug = PHONES[num], m = ev[kind][num];
    const tr = slug && document.querySelector('tr[data-slug="' + slug + '"]');
    const text = kind === 'c' ? (m.rang ? 'rang ' + m.c + '× (not answered)' : m.c + ' call' + (m.c > 1 ? 's' : '') + (m.vm ? ', ' + m.vm + ' voicemail' : '') + (m.missed ? ', ' + m.missed + ' missed' : '')) : (m.c + ' text' + (m.c > 1 ? 's' : ''));
    if (!tr) { unknown.push('(' + num.slice(0, 3) + ') ' + num.slice(3, 6) + '-' + num.slice(6) + ': ' + text + ', last ' + when(m.l)); continue; }
    const cell = tr.querySelector('.calls');
    cell.innerHTML = (cell.textContent === '–' ? '' : cell.innerHTML + '<br>') + text + ' <small>last ' + when(m.l) + '</small>';
    const tag = tr.querySelector('.tag');
    if (!/hot/.test(tag.className)) { if (tag.className === 'tag warm') warm--; else if (tr.classList.contains('cold')) cold--; tag.className = 'tag hot-reply'; tag.textContent = kind === 'c' ? 'Called you' : 'Texted you'; }
  }
  // The Calls box at the top: every caller, newest first, missed and unanswered calls in pink.
  const callers = [];
  for (const [num, m] of Object.entries(ev.c || {})) callers.push({ num, m, kind: 'call' });
  for (const [num, m] of Object.entries(ev.s || {})) callers.push({ num, m, kind: 'text' });
  callers.sort((a, b) => String(b.m.l).localeCompare(String(a.m.l)));
  if (callers.length) {
    const fmt = (n) => '(' + n.slice(0, 3) + ') ' + n.slice(3, 6) + '-' + n.slice(6);
    const rowsHtml = callers.slice(0, 12).map(({ num, m, kind }) => {
      const slug = PHONES[num];
      const tr = slug && document.querySelector('tr[data-slug="' + slug + '"]');
      const who = tr ? tr.querySelector('td a').outerHTML + ' <a class="open" href="/p/' + slug + '/?me=1" target="_blank" rel="noopener">Preview ↗</a>' : 'Unknown caller';
      const missed = kind === 'call' && (m.rang || m.missed);
      const what = kind === 'text' ? 'Texted' + (m.last ? ': “' + m.last.replace(/</g, '&lt;') + '”' : '') : m.rang ? 'Rang, not answered' : (m.missed ? 'Missed call' : 'Call') + (m.vm ? ' · voicemail' : '');
      return '<div class="lead' + (missed ? ' missed' : '') + '"><b>' + fmt(num) + '</b> · ' + who + '<small>' + what + (m.c > 1 ? ' · ' + m.c + '×' : '') + ' · last ' + when(m.l) + '</small></div>';
    }).join('');
    const missedN = callers.filter((x) => x.kind === 'call' && (x.m.rang || x.m.missed)).length;
    document.getElementById('calls').innerHTML = '<h2>Calls and texts' + (missedN ? ' <span class="tag hot-reply">' + missedN + ' missed</span>' : '') + '</h2><div class="card">' + rowsHtml + '<p class="muted" style="margin:10px 0 0">Call back from the Quo app: (888) 444-1847.</p></div>';
  }
  // Leads who called or texted also go into the Hot leads box.
  const hotCard = document.querySelector('#hot-card');
  for (const { num, m, kind } of callers) {
    const slug = PHONES[num];
    const tr = slug && document.querySelector('tr[data-slug="' + slug + '"]');
    if (!tr || !hotCard) continue;
    if (hotCard.querySelector('.muted')) hotCard.innerHTML = '';
    hotCard.insertAdjacentHTML('afterbegin', '<div class="lead">' + tr.querySelector('td a').outerHTML + ' <span class="tag hot-reply">' + (kind === 'text' ? 'Texted you' : m.rang || m.missed ? 'Missed call' : 'Called you') + '</span> <a class="open" href="/p/' + slug + '/?me=1" target="_blank" rel="noopener">Preview ↗</a><small>' + when(m.l) + '</small></div>');
  }
  // Revenue (PayPal).
  const pays = Object.values(ev.$ || {}), month = new Date().toISOString().slice(0, 7);
  if (pays.length || Object.keys(ev.S || {}).length) {
    const sum = (list) => list.reduce((a, p) => a + (Number(p.amt) || 0), 0);
    const active = Object.values(ev.S || {}).filter((x) => ['activated', 'created', 're-activated', 'updated'].includes(x.status)).length;
    document.getElementById('k-rev').textContent = '$' + Math.round(sum(pays.filter((p) => String(p.at).startsWith(month))));
    document.getElementById('k-rev-l').textContent = 'Revenue this month · $' + Math.round(sum(pays)) + ' total · ' + active + ' monthly plan' + (active === 1 ? '' : 's') + ' active';
  }
  document.getElementById('k-hot').textContent = document.querySelectorAll('tr[data-slug] .tag.hot-reply, tr[data-slug] .tag.hot-form').length;
  const hs = [];
  for (const [name, label] of [['quo', 'Quo (calls)'], ['paypal', 'PayPal']]) {
    const x = (ev.x || {})[name];
    hs.push(label + ': ' + (x ? 'last delivery ' + when(x.at) + ', ' + x.result + (x.type ? ' (' + x.type + ')' : '') + (x.result !== 'accepted' && x.headers ? ' [' + x.headers + ']' : '') : 'nothing received yet'));
  }
  document.getElementById('hooks-status').innerHTML = hs.join('<br>');
  for (const a of document.querySelectorAll('a.forget')) a.addEventListener('click', (e) => {
    e.preventDefault();
    a.textContent = 'removing…';
    fetch('/dashboard/api/forget?slug=' + encodeURIComponent(a.dataset.slug), { method: 'POST', headers: { 'x-dashboard': '1' }, credentials: 'same-origin' })
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        const tr = a.closest('tr'), tag = tr.querySelector('.tag');
        tr.querySelector('.opened').innerHTML = '– <small>removed (you)</small>';
        if (tag.className === 'tag warm') { tag.className = 'tag cold'; tag.textContent = 'No reaction yet'; const k = document.getElementById('k-warm'); k.textContent = Math.max(0, Number(k.textContent) - 1); const c = document.getElementById('k-cold'); c.textContent = Number(c.textContent) + 1; }
      })
      .catch((err) => { a.textContent = 'could not remove (' + err.message + ')'; });
  });
  document.getElementById('k-warm').textContent = warm;
  document.getElementById('k-cold').textContent = cold;
}).catch(() => { document.getElementById('k-warm').textContent = '?'; });
</script>
</div></body></html>
`;
}
