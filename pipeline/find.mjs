#!/usr/bin/env node
// Finds new leads with Google Places, spending as little as possible:
//   npm run find -- --trade lawn --city "Austin, TX"            (one search, up to 3 pages)
//   npm run find -- --trade detailing,lawn --city "Austin, TX" --city "Dallas, TX"
//   npm run find -- ... --dry                                  (shows the plan and the worst-case cost, calls nothing)
//   npm run find -- ... --phrases 1                            (only the main search phrase per trade: cheapest)
//   npm run find -- ... --no-check                             (the paid search only: for an environment that can
//                                                               reach Google but not the open web)
//   npm run find -- --check leads/found-2026-11-26.json        (the free part only: their sites and emails, for
//                                                               an environment with open network access)
//
// How it keeps the bill down:
// - Only Text Search (New), never Place Details: one request returns up to 20 businesses with
//   their website, phone and rating, so we pay per 20 businesses, not per business.
// - A field mask with only the fields the pipeline uses. Asking for reviews, photos or opening
//   hours would move every request to a dearer price tier.
// - A few phrases per trade and city (see TRADES); the next page is fetched only while the last
//   one brought enough new independent businesses with a website and reviews.
// - Sites come out in three categories: "weak site" (the main pitch), "decent site" (works but has
//   clear gaps: a separate, second pitch) and "strong site" (kept, not pitched).
//   Every save keeps the file sorted by category (weak, decent, strong, broken, not checked) and
//   writes a readable copy next to it (leads/found-<date>.md), one section per category.
// - Every request is counted in leads/places-usage.json (commit it: cloud sessions forget).
//   The run stops at the monthly cap in config.json, and a search already run is not paid for
//   again unless you add --again.
// - Websites and email addresses are checked with plain HTTP requests, which cost nothing.
//
// Needs GOOGLE_PLACES_API_KEY (or NEON_GOOGLE_PLACES_API_KEY) in the environment. Never commit it.
// Writes leads/found-<date>.json in the same shape as the other lead files, so `npm run lead` reads it.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { blocked } from './dnc.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Several phrases per trade: each finds a somewhat different set of businesses, all fitting the
// trade's site kit (the detailing kit words itself for shops as well as mobile detailers). The
// first phrase is the main one; --phrases 1 searches only that. Overlap between phrases is skipped
// for free, and a phrase stops paging once its pages bring few new businesses.
export const TRADES = {
  lawn: { trade: 'Lawn care', queries: ['lawn care service', 'landscaping', 'lawn mowing service', 'yard maintenance'] },
  detailing: { trade: 'Mobile car detailing', queries: ['mobile car detailing', 'auto detailing', 'car detailing', 'ceramic coating'] },
  // Test trades: no site kit yet, so no previews (npm run batch skips them). Search one city with
  // --pages 1 to see how many weak sites the trade has before anyone builds a kit for it.
  pressure: { trade: 'Pressure washing', queries: ['pressure washing service'], test: true },
  pool: { trade: 'Pool cleaning', queries: ['pool cleaning service'], test: true },
  windows: { trade: 'Window cleaning', queries: ['window cleaning service'], test: true },
  // Small one-person trades. "kit" = the existing kit their site would use if the test goes well.
  petwaste: { trade: 'Pet waste removal', queries: ['pet waste removal service'], test: true, kit: 'lawn' },
  sprinkler: { trade: 'Sprinkler repair', queries: ['sprinkler repair'], test: true, kit: 'lawn' },
  stump: { trade: 'Stump grinding', queries: ['stump grinding'], test: true, kit: 'lawn' },
  sod: { trade: 'Sod installation', queries: ['sod installation'], test: true, kit: 'lawn' },
  lights: { trade: 'Christmas light installation', queries: ['christmas light installation'], test: true, kit: 'lawn' },
  boat: { trade: 'Boat detailing', queries: ['boat detailing'], test: true, kit: 'detailing' },
  rv: { trade: 'RV detailing', queries: ['rv detailing'], test: true, kit: 'detailing' },
  dent: { trade: 'Paintless dent repair', queries: ['paintless dent repair'], test: true, kit: 'detailing' },
  windshield: { trade: 'Windshield chip repair', queries: ['mobile windshield chip repair'], test: true, kit: 'detailing' },
  handyman: { trade: 'Handyman', queries: ['handyman service'], test: true },
  painting: { trade: 'House painting', queries: ['house painter'], test: true },
  junk: { trade: 'Junk removal', queries: ['junk removal'], test: true },
  grooming: { trade: 'Mobile dog grooming', queries: ['mobile dog grooming'], test: true },
};

/** Trades still being tested: searched, never built into previews until promoted. */
export const TEST_TRADES = new Set(Object.values(TRADES).filter((t) => t.test).map((t) => t.trade));

// Only these fields, all in one price tier. Adding reviews, photos, regularOpeningHours or
// editorialSummary would make every request dearer.
export const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber',
  'places.websiteUri', 'places.rating', 'places.userRatingCount', 'places.googleMapsUri',
  'places.businessStatus', 'nextPageToken',
].join(',');

export const DEFAULTS = { monthlyRequestCap: 600, usdPer1000: 35, maxPages: 3, minReviews: 10, minUseful: 4 };

// National chains and franchises: not our customers.
const CHAINS = new RegExp(['lawn doctor', 'lawnstarter', 'lawn love', 'massey', 'weed man', 'savatree', 'augusta lawn', 'trugreen', 'brightview', 'davey tree', 'grounds guys', 'u s lawns', 'spring green', 'naturalawn', 'heroes lawn', 'senske', 'greenpal', 'sunday lawn', 'ziebart', 'tint world', 'spiffy', 'detail garage', 'mister car wash', 'tidal wave', 'take 5', 'dent wizard', 'shwash', 'goldie', 'clean air lawn care', 'emerald lawns', 'real green', 'just right lawns', 'pawgo', 'foreverlawn', 'mr handyman', '1 800 got junk', 'college hunks', 'junk king', 'two men and a truck', 'aussie pet mobile', 'christmas decor', 'dent wizard', 'safelite']
  .map((n) => n.replace(/ /g, '[\\s.-]*')).join('|'), 'i');
// No website of their own to rebuild from.
const NO_SITE_HOSTS = /(^|\.)(facebook|instagram|yelp|nextdoor|linktr|heygoldie|booksy|vagaro|setmore|square|squareup|urable|thumbtack|angi|homeadvisor|google|tiktok|x|twitter)\.(com|ee|site|me)$/i;
// A free subdomain from a site builder: still a lead (often the best kind), but flagged.
const BUILDER_SUBDOMAIN = /\.(wixsite\.com|netlify\.app|godaddysites\.com|business\.site|sitedrop\.live|weebly\.com|square\.site|carrd\.co|webflow\.io|wordpress\.com|amazonaws\.com|vercel\.app)$/i;
// Email addresses that are not the business's: placeholders, builders and trackers.
const JUNK_EMAIL = /@(example\.|domain\.|email\.|yourdomain|sentry|wixpress|godaddy\.com|webador|squarespace|weebly|wix\.com|filler|mysite|website\.com|.*\.(png|jpe?g|gif|webp|svg)$)|^(filler|user|name|your|you|email|test|noreply|no-reply)@/i;
const FREE_MAIL = /@(gmail|yahoo|hotmail|outlook|aol|icloud|live|msn|comcast|att|ymail)\./i;

export const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

/** The month key for the usage ledger, e.g. "2026-11". */
export const monthOf = (d = new Date()) => d.toISOString().slice(0, 7);

/** List-price cost of a number of requests, in dollars. */
export const cost = (requests, usdPer1000 = DEFAULTS.usdPer1000) => Math.round(requests * usdPer1000) / 1000;

/** True when nearly every site failed to load: the network is blocking them, not the sites
 *  being broken (about 1 in 10 is, normally). Then nothing is saved as "site broken". */
export function networkLooksBlocked(checked) {
  const failed = checked.filter((l) => l.kind === 'site broken').length;
  return (checked.length >= 3 && failed === checked.length) || (checked.length >= 5 && failed / checked.length >= 0.8);
}

/** Why a place from the search is not worth a lead (or null if it is). Uses only the API's fields. */
export function skipReason(place, { minReviews = DEFAULTS.minReviews, known = new Set() } = {}) {
  const name = place.displayName?.text ?? '';
  if (known.has(place.id)) return 'already in leads/';
  if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') return 'closed';
  if (CHAINS.test(name) || CHAINS.test(place.websiteUri ?? '')) return 'chain';
  if (!place.websiteUri) return 'no website';
  if (known.has(`host:${hostOf(place.websiteUri)}`)) return 'already in leads/';
  if (NO_SITE_HOSTS.test(hostOf(place.websiteUri))) return 'social or booking page only';
  if (multiLocation(place.websiteUri)) return 'multi-location company';
  if ((place.userRatingCount ?? 0) < minReviews) return `under ${minReviews} reviews`;
  return null;
}

const STATES = 'al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy';
/** A branch page of a company with offices in several cities: /locations/round-rock-tx/,
 *  /service-locations/tx/austin/, /austin-tx/... Not a small local business. */
export function multiLocation(url) {
  let p = '';
  try { p = new URL(url).pathname.toLowerCase(); } catch { return false; }
  return /\/(locations?|service-locations|branches|offices)\//.test(p) || new RegExp(`/[a-z-]+-(${STATES})(/|$)`).test(p);
}

/** One lead per website: a business with a Google listing per neighbourhood is still one business
 *  (and gets one email). Keeps the listing with the most reviews. */
export function onePerWebsite(leads) {
  const best = new Map();
  for (const l of leads) {
    const h = hostOf(l.website ?? '') || l.placeId;
    if (!best.has(h) || (l.reviews ?? 0) > (best.get(h).reviews ?? 0)) best.set(h, l);
  }
  return leads.filter((l) => best.get(hostOf(l.website ?? '') || l.placeId) === l);
}

/** Whether to pay for the next page: only while this one still had enough useful businesses. */
export function worthNextPage(places, opts) {
  return places.filter((p) => !skipReason(p, opts)).length >= (opts?.minUseful ?? DEFAULTS.minUseful);
}

/** A lead in the shape of the existing lead files (before the website check). */
export function toLead(place, trade, city) {
  return {
    placeId: place.id,
    name: place.displayName?.text ?? '',
    website: place.websiteUri,
    address: place.formattedAddress ?? '',
    phone: place.nationalPhoneNumber ?? '',
    rating: place.rating ?? null,
    reviews: place.userRatingCount ?? 0,
    mapsUrl: place.googleMapsUri ?? '',
    trade,
    city,
  };
}

/** The best email address on their pages: their own domain first, then a free mailbox. */
export function pickEmail(html, website) {
  const site = hostOf(website);
  const found = new Set();
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) found.add(decodeURIComponent(m[1]).toLowerCase());
  for (const m of html.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) found.add(m[0].toLowerCase());
  const emails = [...found].filter((e) => !JUNK_EMAIL.test(e));
  const own = emails.find((e) => { const d = e.split('@')[1]; return site && (site === d || site.endsWith(`.${d}`) || d.endsWith(`.${site}`)); });
  const free = emails.find((e) => FREE_MAIL.test(e));
  if (own || free) return { email: own ?? free };
  // Some other domain (often the web designer's): keep it, flagged, only if nothing better.
  return emails[0] ? { email: emails[0], emailNote: 'email domain differs from the website: check it is theirs' } : { email: '' };
}

/** What a working site could do better, from its HTML (free). Any of these makes it a "decent
 *  site": worth an email, in its own category. None makes it a "strong site": kept, not pitched. */
export function improvements(html, { ms, year = new Date().getFullYear() }) {
  const out = [];
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/\s+/g, ' ');
  if (!/href=["']?tel:/i.test(html)) out.push('no tap-to-call link');
  if (!/<form[\s>]/i.test(html) && !/>[^<]{0,40}\b(book|schedule|quote|estimate)\b[^<]{0,40}<\/(a|button)>/i.test(html)) out.push('no quote or booking form');
  if (!/review|testimonial|what (our )?(customers|clients) say|★/i.test(text)) out.push('no reviews on the site');
  const photos = [...html.matchAll(/<img[^>]+src=["']?([^"' >]+)/gi)].filter((m) => !/logo|icon|\.svg|data:|pixel|spacer/i.test(m[1])).length;
  if (photos < 4) out.push(photos ? `only ${photos} photo${photos === 1 ? '' : 's'}` : 'no photos');
  if (!/<meta[^>]+name=["']?description/i.test(html)) out.push('no meta description');
  if (ms > 2500 && ms <= 4000) out.push(`loads in ${(ms / 1000).toFixed(1)}s`);
  const copy = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => +m[1]);
  if (copy.length && Math.max(...copy) < year && Math.max(...copy) > year - 3) out.push(`copyright ${Math.max(...copy)}`);
  return out;
}

/** weak site (any weakness), decent site (works, with things to improve) or strong site. */
export const siteKind = (reasons, better) => (reasons.length ? 'weak site' : better.length ? 'decent site' : 'strong site');

/** What is weak about a site, from its HTML (free: no API). Same reasons as the older lead files. */
export function weaknesses(html, { url, ms, year = new Date().getFullYear() }) {
  const reasons = [];
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/\s+/g, ' ').trim();
  if (ms > 4000) reasons.push(`slow (${(ms / 1000).toFixed(1)}s)`);
  if (url.startsWith('http://')) reasons.push('no https');
  if (!/<meta[^>]+name=["']?viewport/i.test(html)) reasons.push('not mobile-friendly');
  if (text.length < 400) reasons.push('almost empty');
  if (/img1\.wsimg\.com|godaddy/i.test(html)) reasons.push('GoDaddy site builder');
  if (/weebly/i.test(html)) reasons.push('Weebly');
  const copy = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => +m[1]);
  if (copy.length && Math.max(...copy) <= year - 3) reasons.push(`copyright ${Math.max(...copy)}`);
  if (BUILDER_SUBDOMAIN.test(hostOf(url))) reasons.push('no domain of its own');
  return reasons;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const textLength = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/\s+/g, ' ').trim().length;

/** A page's HTML: a plain request first (fast), the browser when that fails or the page is built by
 *  JavaScript (Wix, Squarespace, React...). Both are free. */
async function get(url, browser) {
  const t0 = Date.now();
  let res = null;
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': UA } });
    res = { ok: r.ok, html: r.ok ? await r.text() : '', ms: Date.now() - t0, url: r.url || url };
  } catch { /* try the browser */ }
  if (res?.ok && textLength(res.html) >= 400) return res;
  if (!browser) return res ?? { ok: false, html: '', ms: Date.now() - t0, url };
  const page = await browser.newPage({ userAgent: UA });
  try {
    const t1 = Date.now();
    const r = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
    if (!r) return res ?? { ok: false, html: '', ms: Date.now() - t0, url };
    return { ok: r.ok(), html: await page.content(), ms: res?.ms ?? Date.now() - t1, url: page.url() };
  } finally {
    await page.close();
  }
}

/** Loads their site (and a contact page if the home page has no email): weaknesses and email. */
export async function checkSite(lead, browser) {
  try {
    const home = await get(lead.website, browser);
    if (!home.ok) return { ...lead, loadMs: home.ms, reasons: ['does not load'], kind: 'site broken', email: '' };
    const reasons = weaknesses(home.html, { url: home.url, ms: home.ms });
    let mail = pickEmail(home.html, home.url);
    if (!mail.email || mail.emailNote) {
      const contact = home.html.match(/href=["']([^"']*contact[^"']*)["']/i)?.[1] ?? home.html.match(/href=["']([^"']*about[^"']*)["']/i)?.[1];
      if (contact) {
        const page = await get(new URL(contact, home.url).href, browser).catch(() => null);
        const better = page?.ok ? pickEmail(page.html, home.url) : null;
        if (better?.email && (!mail.email || !better.emailNote)) mail = better;
      }
    }
    const better = reasons.length ? [] : improvements(home.html, { ms: home.ms });
    return { ...lead, loadMs: home.ms, reasons, improvements: better, kind: siteKind(reasons, better), ...mail };
  } catch {
    return { ...lead, loadMs: null, reasons: ['does not load'], kind: 'site broken', email: '' };
  }
}

async function readJson(file, fallback) {
  return readFile(file, 'utf8').then(JSON.parse).catch(() => fallback);
}

/** Every place ID already in leads/ (searched before, so not a new lead). */
async function knownPlaceIds() {
  const ids = new Set();
  for (const f of await readdir(path.join(root, 'leads'))) {
    if (!/^(us-|found-).*\.json$/.test(f)) continue; // lead files only (not usage, cities, sent)
    const data = await readJson(path.join(root, 'leads', f), []);
    const list = Array.isArray(data) ? data : Object.values(data).find(Array.isArray) ?? [];
    for (const l of list) {
      if (l?.placeId) ids.add(l.placeId);
      // Older files: the same business under another listing is not new either.
      if (l?.website && f.startsWith('us-')) ids.add(`host:${hostOf(l.website)}`);
    }
  }
  return ids;
}

/** The next cities from leads/cities.json that no search has covered yet. */
async function nextCities(n) {
  const list = (await readJson(path.join(root, 'leads', 'cities.json'), { cities: [] })).cities;
  const usage = await readJson(path.join(root, 'leads', 'places-usage.json'), { queries: {} });
  const main = Object.values(TRADES).filter((t) => !t.test).flatMap((t) => t.queries);
  const done = new Set(Object.keys(usage.queries ?? {}).filter((q) => main.some((m) => q.startsWith(`${m} in `))).map((q) => q.split(' in ').at(-1)));
  for (const f of await readdir(path.join(root, 'leads'))) {
    if (!/^(us-|found-).*\.json$/.test(f)) continue;
    const data = await readJson(path.join(root, 'leads', f), []);
    for (const l of Array.isArray(data) ? data : []) if (l?.city && !TEST_TRADES.has(l.trade)) done.add(l.city);
  }
  const picked = list.filter((c) => !done.has(c)).slice(0, n);
  if (!picked.length) throw new Error('Every city in leads/cities.json has been searched: add more.');
  console.log(`Next cities: ${picked.join('; ')}`);
  return picked;
}

async function searchPage(key, textQuery, pageToken) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK },
    body: JSON.stringify({ textQuery, pageSize: 20, regionCode: 'US', ...(pageToken ? { pageToken } : {}) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Places API ${res.status}: ${body.error?.message ?? 'no details'}`);
  return body;
}

function parseArgs(argv) {
  const all = (name) => argv.flatMap((a, i) => (a === `--${name}` ? [argv[i + 1]] : []));
  const one = (name) => all(name)[0];
  return {
    trades: all('trade').flatMap((t) => t.split(',')).map((t) => t.trim()).filter(Boolean),
    cities: all('city').map((c) => c.trim()).filter(Boolean),
    dry: argv.includes('--dry'),
    again: argv.includes('--again'),
    noCheck: argv.includes('--no-check'),
    check: one('check'),
    maxPages: one('pages') ? Math.min(3, +one('pages')) : undefined,
    phrases: one('phrases') ? Math.max(1, +one('phrases')) : undefined,
    next: one('next') ? Math.max(1, +one('next')) : undefined,
    minReviews: one('min-reviews') ? +one('min-reviews') : undefined,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dnc = (await readJson(path.join(root, 'do-not-contact.json'), { entries: [] })).entries;
  if (args.check) return checkFile(path.resolve(args.check), dnc, { again: args.again });
  if (args.next) args.cities.push(...await nextCities(args.next));
  if (!args.trades.length || !args.cities.length || args.trades.some((t) => !TRADES[t])) {
    console.log(`Trades: ${Object.keys(TRADES).join(', ')} (${Object.entries(TRADES).filter(([, t]) => t.test).map(([k]) => k).join(', ')}: test only, no kit yet).`);
    console.log('npm run find -- --trade lawn|detailing[,…] --city "Austin, TX" [--city …] | --next 3 [--pages 1-3] [--phrases 1-4] [--min-reviews 10] [--dry] [--again] [--no-check]');
    console.log('npm run find -- --check leads/found-<date>.json [--again]   (--again re-checks leads already checked)');
    process.exit(1);
  }
  const config = await readJson(path.join(root, 'config.json'), {});
  const opts = { ...DEFAULTS, ...(config.places ?? {}) };
  if (args.maxPages) opts.maxPages = args.maxPages;
  if (args.minReviews !== undefined) opts.minReviews = args.minReviews;

  const usageFile = path.join(root, 'leads', 'places-usage.json');
  const usage = await readJson(usageFile, { about: 'Google Places requests, counted by pipeline/find.mjs. Commit this file: it is the only record across sessions.', months: {}, queries: {} });
  usage.queries ??= {};
  const month = (usage.months[monthOf()] ??= { requests: 0 });

  const plan = args.trades.flatMap((t) => args.cities.flatMap((city) => TRADES[t].queries.slice(0, args.phrases ?? Infinity)
    .map((query) => ({ trade: TRADES[t].trade, city, textQuery: `${query} in ${city}` }))));
  const todo = plan.filter((q) => args.again || !usage.queries[q.textQuery]);
  for (const q of plan) if (!todo.includes(q)) console.log(`Skipping "${q.textQuery}": already searched on ${usage.queries[q.textQuery]} (add --again to pay for it again).`);
  const worst = todo.length * opts.maxPages;
  const left = opts.monthlyRequestCap - month.requests;
  console.log(`${todo.length} searches, at most ${worst} requests (~$${cost(worst, opts.usdPer1000).toFixed(2)} at list price). This month: ${month.requests} of ${opts.monthlyRequestCap} requests used.`);
  if (args.dry || !todo.length) return;
  // Pasted keys often carry quotes, spaces or a line break: Google then answers "API key not valid".
  const key = (process.env.GOOGLE_PLACES_API_KEY || process.env.NEON_GOOGLE_PLACES_API_KEY || '').trim().replace(/^["']|["']$/g, '').trim();
  if (!key) throw new Error('No GOOGLE_PLACES_API_KEY (or NEON_GOOGLE_PLACES_API_KEY) in the environment.');
  if (left <= 0) throw new Error(`Monthly cap reached (${opts.monthlyRequestCap} requests, config.json places.monthlyRequestCap). Nothing was called.`);

  const known = await knownPlaceIds();
  const leads = [];
  const skipped = {};
  let used = 0;
  try {
    for (const q of todo) {
      if (month.requests >= opts.monthlyRequestCap) { console.log(`Monthly cap reached: "${q.textQuery}" and the rest were not searched.`); break; }
      let token;
      for (let page = 1; page <= opts.maxPages; page++) {
        if (month.requests >= opts.monthlyRequestCap) { console.log('Monthly cap reached: no more pages.'); break; }
        const body = await searchPage(key, q.textQuery, token);
        month.requests++; used++;
        const places = body.places ?? [];
        const more = worthNextPage(places, { ...opts, known });
        for (const p of places) {
          const why = skipReason(p, { ...opts, known });
          if (why) { skipped[why] = (skipped[why] ?? 0) + 1; continue; }
          known.add(p.id);
          leads.push(toLead(p, q.trade, q.city));
        }
        console.log(`"${q.textQuery}" page ${page}: ${places.length} places`);
        token = body.nextPageToken;
        usage.queries[q.textQuery] = new Date().toISOString().slice(0, 10);
        if (!token || !more) break;
      }
    }
  } finally {
    // Count what was spent even if a request failed halfway.
    await writeFile(usageFile, JSON.stringify(usage, null, 1) + '\n');
  }

  // Save what was paid for before anything else can fail.
  const out = path.join(root, 'leads', `found-${new Date().toISOString().slice(0, 10)}.json`);
  const fresh = onePerWebsite(leads.filter((l) => !blocked(l, dnc))).map((l) => ({ ...l, kind: 'not checked' }));
  if (fresh.length < leads.length) skipped['extra listing of the same business'] = leads.length - fresh.length;
  await saveLeads(out, fresh);
  console.log(`\n${used} requests (~$${cost(used, opts.usdPer1000).toFixed(2)} at list price); ${month.requests} of ${opts.monthlyRequestCap} this month.`);
  console.log(`${fresh.length} new leads → ${path.relative(root, out)}. Left out: ${Object.entries(skipped).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}.`);
  if (args.noCheck) {
    console.log(`Not checked yet. In an environment with open network access: npm run find -- --check ${path.relative(root, out)}`);
    return;
  }
  await checkFile(out, dnc);
}

/** The order lead files are kept in: weak sites first (the main pitch), then decent, then strong. */
export const KIND_ORDER = ['weak site', 'decent site', 'strong site', 'site broken', 'not checked'];
const KIND_TITLES = { 'weak site': 'Weak sites (main pitch)', 'decent site': 'Decent sites (second pitch: room to improve)', 'strong site': 'Strong sites (not pitched)', 'site broken': 'Sites that did not load', 'not checked': 'Not checked yet' };
const kindRank = (k) => (KIND_ORDER.includes(k) ? KIND_ORDER.indexOf(k) : KIND_ORDER.length);

/** Sorted by category (weak, decent, strong, broken, not checked), then those with an email, then trade, then most reviews. */
export function sortLeads(leads) {
  return [...leads].sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || !a.email - !b.email
    || (a.trade ?? '').localeCompare(b.trade ?? '') || (b.reviews ?? 0) - (a.reviews ?? 0));
}

/** A readable copy of a lead file, one section per category, with a count per trade at the top. */
export function leadsReport(leads, title) {
  const sorted = sortLeads(leads);
  const kinds = [...new Set(sorted.map((l) => l.kind))];
  const trades = [...new Set(sorted.map((l) => l.trade))].sort();
  const n = (t, k) => sorted.filter((l) => l.trade === t && l.kind === k).length;
  const lines = [`# ${title}`, '', `${sorted.length} leads. Generated by pipeline/find.mjs from the .json file of the same name: don't edit by hand.`, '',
    `| Trade | ${kinds.join(' | ')} | Total |`, `|---|${kinds.map(() => '---:').join('|')}|---:|`,
    ...trades.map((t) => `| ${t} | ${kinds.map((k) => n(t, k)).join(' | ')} | ${sorted.filter((l) => l.trade === t).length} |`)];
  for (const k of kinds) {
    const group = sorted.filter((l) => l.kind === k);
    lines.push('', `## ${KIND_TITLES[k] ?? k} (${group.length})`, '');
    for (const l of group) {
      const notes = (l.reasons?.length ? l.reasons : l.improvements ?? []).join(', ');
      lines.push(`- **${l.name}** (${l.trade}, ${l.city}, ${l.reviews ?? 0} reviews) ${l.website ?? ''}${k === 'not checked' ? '' : ` · ${l.email || 'no email'}`}${notes ? ` · ${notes}` : ''}`);
    }
  }
  return lines.join('\n') + '\n';
}

async function saveLeads(file, leads) {
  const before = await readJson(file, []);
  const merged = [...before.filter((b) => !leads.some((k) => k.placeId === b.placeId)), ...leads];
  // Applies the current rules to the whole file, so files saved by an older version get them too.
  const clean = sortLeads(onePerWebsite(merged.filter((l) => !multiLocation(l.website) && !CHAINS.test(l.name ?? '') && !CHAINS.test(l.website ?? ''))));
  await writeFile(file, JSON.stringify(clean, null, 1) + '\n');
  await writeFile(file.replace(/\.json$/, '.md'), leadsReport(clean, path.basename(file, '.json')));
  return merged.length - clean.length;
}

/** The free part: their websites and emails, for every lead in the file not checked yet. */
async function checkFile(file, dnc, { again = false } = {}) {
  const all = await readJson(file, null);
  if (!Array.isArray(all)) throw new Error(`${file} is not a lead file.`);
  const clean = new Set(onePerWebsite(all.filter((l) => !multiLocation(l.website) && !CHAINS.test(l.name ?? '') && !CHAINS.test(l.website ?? ''))));
  const todo = all.filter((l) => clean.has(l) && (again || l.kind === 'not checked') && !blocked(l, dnc));
  if (!todo.length) {
    // Still apply the current rules (chains, branches, one per website) to the file.
    const removed = await saveLeads(file, []);
    console.log(`Nothing to check in ${path.relative(root, file)}.${removed ? ` Removed ${removed} chain, multi-location or duplicate listings.` : ''}`);
    return;
  }
  // Playwright is installed globally in the cloud sessions; require() finds it from any folder.
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  const checked = [];
  try {
    for (let i = 0; i < todo.length; i += 6) checked.push(...await Promise.all(todo.slice(i, i + 6).map((l) => checkSite(l, browser))));
  } finally {
    await browser.close();
  }
  if (networkLooksBlocked(checked)) {
    throw new Error(`${checked.filter((l) => l.kind === 'site broken').length} of ${checked.length} sites did not load: this environment's network is probably blocking them. `
      + `Nothing was changed; the leads are saved unchecked. Run npm run find -- --check ${path.relative(root, file)} where the network is open.`);
  }
  const removed = await saveLeads(file, checked.filter((l) => !blocked(l, dnc)));
  if (removed) console.log(`Removed ${removed} chain, multi-location or duplicate listings.`);
  const withEmail = checked.filter((l) => l.email);
  const by = (k) => withEmail.filter((l) => l.kind === k).length;
  console.log(`Checked ${checked.length} sites, ${withEmail.length} with an email: ${by('weak site')} weak, ${by('decent site')} decent (room to improve, separate category), ${by('strong site')} strong (not pitched), ${by('site broken')} broken → ${path.relative(root, file)}`);
  for (const [trade, group] of Object.entries(Object.groupBy(withEmail, (l) => l.trade)))
    console.log(`  ${trade}: ${KIND_ORDER.filter((k) => k !== 'not checked').map((k) => `${group.filter((l) => l.kind === k).length} ${k.replace(' site', '')}`).join(', ')}`);
  console.log(`Sorted weak → decent → strong in the file; readable copy: ${path.relative(root, file.replace(/\.json$/, '.md'))}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
