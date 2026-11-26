#!/usr/bin/env node
// Finds leads: US businesses of a trade, their site's weaknesses, and an email from their own site.
//   npm run research -- --trade detailing,lawn --cities "Dallas, TX;Atlanta, GA" [--cap 120]
//   npm run research -- --trade detailing,lawn          (the default city list below)
// Writes leads/us-<date>.json. Places already in any leads/ file are skipped (no second Google cost).
// Google key: GOOGLE_PLACES_API_KEY (in a cloud session a placeholder; the proxy adds the real key).
// Cost guard: --cap counts Google requests (default 120, about $4 at list price; keep the month under $25).

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const TRADES = {
  detailing: { label: 'Mobile car detailing', query: 'mobile car detailing' },
  lawn: { label: 'Lawn care', query: 'lawn care service' },
};

export const CITIES = [
  'Dallas, TX', 'Fort Worth, TX', 'San Antonio, TX', 'Austin, TX', 'Atlanta, GA', 'Orlando, FL', 'Jacksonville, FL',
  'Miami, FL', 'Charlotte, NC', 'Raleigh, NC', 'Nashville, TN', 'Las Vegas, NV', 'Mesa, AZ', 'Scottsdale, AZ',
  'Tucson, AZ', 'San Diego, CA', 'Sacramento, CA', 'Denver, CO', 'Oklahoma City, OK', 'Columbia, SC',
];

const FIELDS = 'places.id,places.displayName,places.websiteUri,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.businessStatus,places.googleMapsUri,nextPageToken';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchPlaces(textQuery, { apiKey, onRequest }) {
  const places = [];
  let pageToken;
  for (let page = 0; page < 3; page++) {
    onRequest();
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey, 'x-goog-fieldmask': FIELDS },
      body: JSON.stringify({ textQuery, languageCode: 'en', regionCode: 'US', pageSize: 20, ...(pageToken && { pageToken }) }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Places API answered ${response.status}: ${body?.error?.message ?? ''}`);
    for (const p of body.places ?? []) {
      if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
      places.push({ placeId: p.id, name: p.displayName?.text ?? '', website: p.websiteUri ?? '', address: p.formattedAddress ?? '', phone: p.nationalPhoneNumber ?? '', rating: p.rating ?? null, reviews: p.userRatingCount ?? 0, mapsUrl: p.googleMapsUri ?? '' });
    }
    pageToken = body.nextPageToken;
    if (!pageToken) break;
    await sleep(2000); // a page token needs a moment before it works
  }
  return places;
}

const SOCIAL = /facebook\.com|instagram\.com|yelp\.com|nextdoor|thumbtack|angi\.com|homeadvisor|business\.site|linktr\.ee|tiktok|google\.com|square\.site|booksy|vagaro|setmore|squareup/i;
const UA = 'Mozilla/5.0 (compatible; site-check/1.0; a few pages per site)';

async function get(url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const html = r.ok && /html/i.test(r.headers.get('content-type') ?? 'text/html') ? await r.text() : '';
    return { ok: r.ok && html.length > 0, url: r.url, html, ms: Date.now() - t0 };
  } catch {
    return { ok: false, url, html: '', ms: Date.now() - t0 };
  }
}

/** What is wrong with a home page, as short reasons the email can quote (pipeline/email.mjs). */
export function weaknesses({ html, url, ms }) {
  const reasons = [];
  if (!/^https:/.test(url)) reasons.push('no https');
  if (!/<meta[^>]+name=["']viewport/i.test(html)) reasons.push('not mobile-friendly');
  const years = [...html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => +m[1]).filter((y) => y > 1995 && y < 2035);
  if (years.length && Math.max(...years) <= 2021) reasons.push(`copyright ${Math.max(...years)}`);
  if (/img1\.wsimg\.com|websites\.godaddy/i.test(html)) reasons.push('GoDaddy site builder');
  if (/weebly/i.test(html)) reasons.push('Weebly');
  if (ms > 5000) reasons.push(`slow (${(ms / 1000).toFixed(1)}s)`);
  const words = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  if (words < 150) reasons.push('almost empty');
  return reasons;
}

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

/** Addresses in a page: mailto links and plain text, without image names and placeholders. */
export function emailsIn(html) {
  const found = [...html.matchAll(/mailto:([^"'?>\s]+)/gi), ...html.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi)]
    .map((m) => decodeURIComponent(m[1] ?? m[0]).toLowerCase().trim());
  return [...new Set(found)].filter((e) => /^[\w.+-]+@[\w-]+(\.[\w-]+)*\.[a-z]{2,}$/.test(e)
    && !/\.(png|jpe?g|gif|svg|webp)$/.test(e) && !/no-?reply|example|sentry|wixpress|domain\.com|email\.com|yourname|wordpress@|@2x/.test(e));
}

/** The best address for the business: its own domain first, then a role address (info@...). */
export function pickEmail(emails, website) {
  const site = host(website);
  const score = (e) => (e.endsWith(`@${site}`) ? 4 : 0) + (/^(info|office|contact|hello|service|sales|admin|team|book|booking)@/.test(e) ? 2 : 0);
  return [...emails].sort((a, b) => score(b) - score(a))[0] ?? '';
}

async function findEmail(home) {
  let emails = emailsIn(home.html);
  if (!emails.length) {
    const links = [...home.html.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => m[1]).filter((h) => /contact|about|book|quote/i.test(h));
    for (const link of [...new Set(links)].slice(0, 3)) {
      let url; try { url = new URL(link, home.url).href; } catch { continue; }
      if (host(url) !== host(home.url)) continue;
      const page = await get(url);
      emails = emailsIn(page.html);
      if (emails.length) break;
    }
  }
  return pickEmail(emails, home.url);
}

async function knownPlaceIds() {
  const ids = new Set();
  for (const f of (await readdir(path.join(root, 'leads'))).filter((x) => x.endsWith('.json'))) {
    const data = JSON.parse(await readFile(path.join(root, 'leads', f), 'utf8'));
    const lists = Array.isArray(data) ? [data] : Object.values(data).filter(Array.isArray);
    for (const l of lists) for (const p of l) if (p.placeId) ids.add(p.placeId);
  }
  return ids;
}

async function main() {
  const { values } = parseArgs({ options: { trade: { type: 'string', default: 'detailing,lawn' }, cities: { type: 'string' }, cap: { type: 'string', default: '120' } } });
  const trades = values.trade.split(',').map((t) => { const x = TRADES[t.trim()]; if (!x) throw new Error(`Unknown trade "${t}" (${Object.keys(TRADES).join(', ')})`); return x; });
  const cities = values.cities ? values.cities.split(';').map((c) => c.trim()).filter(Boolean) : CITIES;
  const cap = Number(values.cap);
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set (a placeholder is enough in a cloud session).');
  const known = await knownPlaceIds();
  let used = 0;
  const found = new Map();
  for (const trade of trades) for (const city of cities) {
    if (used + 3 > cap) { console.log(`Google request cap (${cap}) reached: stopped before ${trade.label} in ${city}.`); break; }
    const places = await searchPlaces(`${trade.query} in ${city}`, { apiKey, onRequest: () => used++ });
    let fresh = 0;
    for (const p of places) if (!known.has(p.placeId) && !found.has(p.placeId)) { found.set(p.placeId, { ...p, trade: trade.label, city }); fresh++; }
    console.log(`  ${trade.label} in ${city}: ${places.length} found, ${fresh} new`);
  }
  console.log(`Google requests: ${used}. New businesses: ${found.size}. Checking their sites...`);
  const rows = [...found.values()];
  let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < rows.length) {
      const r = rows[i++];
      if (!r.website) { r.kind = 'no site'; continue; }
      if (SOCIAL.test(r.website)) { r.kind = 'social only'; continue; }
      const home = await get(r.website);
      r.loadMs = home.ms;
      if (!home.ok) { r.kind = 'site broken'; r.reasons = ['does not load']; continue; }
      r.reasons = weaknesses(home);
      r.kind = r.reasons.length ? 'weak site' : 'decent site';
      r.email = await findEmail(home);
    }
  }));
  const file = path.join(root, 'leads', `us-${new Date().toISOString().slice(0, 10)}-${trades.map((t) => t.query.split(' ')[0]).join('-')}.json`);
  await writeFile(file, JSON.stringify(rows, null, 1) + '\n');
  const kinds = ['weak site', 'decent site', 'site broken', 'social only', 'no site'];
  for (const k of kinds) { const l = rows.filter((r) => r.kind === k); console.log(`${k.padEnd(12)} ${String(l.length).padStart(4)}   with email ${l.filter((r) => r.email).length}`); }
  const good = rows.filter((r) => r.kind === 'weak site' && r.email);
  console.log(`\n${good.length} leads ready for a preview (weak site + email) → ${path.relative(root, file)}`);
  for (const r of good) console.log(`  ${r.trade.slice(0, 9).padEnd(9)} ${r.name.slice(0, 36).padEnd(36)} ${r.city.padEnd(18)} ${String(r.reviews).padStart(4)} reviews  ${r.reasons.join(', ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(`\nStopped: ${e.message}`); process.exitCode = 1; });
