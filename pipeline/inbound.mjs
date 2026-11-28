#!/usr/bin/env node
// A preview request from the neonsignsites.com form, done at once and without approval (Alon, 2026-11-28):
// they asked for it, so it skips the daily list. Run by .github/workflows/preview-request.yml, which the
// Worker starts the moment the form is sent (forms.js → GitHub repository_dispatch).
//   node pipeline/inbound.mjs --build   (INBOUND = {"business","website","email"} JSON in the environment)
//       finds their Google listing (1 Places request), checks their site, builds the preview with a
//       direct AI call, checks it, and writes outbox/inbound-<slug>.json. Exit 2 = not built (reason in
//       outbox/inbound-failed.json): the workflow then emails Alon instead.
//   node pipeline/inbound.mjs --send <slug>   waits until the preview link opens, emails them from
//       config.json sending.inbound (default alon@neonsignsites.net), logs it in leads/sent.json.
//   node pipeline/inbound.mjs --tell-alon     emails Alon why a request could not be done automatically.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { searchPage, checkSite, hostOf, monthOf, JUNK_EMAIL } from './find.mjs';
import { cleanName, kitFor } from './copy.mjs';
import { blocked } from './dnc.mjs';
import { slugify } from './batch.mjs';
import { weakness, gap, signature } from './email.mjs';
import { accessToken, mime } from './send.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (f, fb) => readFile(path.join(root, f), 'utf8').then(JSON.parse).catch(() => fb);
const save = (f, v) => writeFile(path.join(root, f), JSON.stringify(v, null, 2) + '\n');
const LEADS = 'leads/found-inbound.json';

/** The trade, from what their own site talks about most (only trades with a kit). */
export function tradeOf(text = '') {
  const t = text.toLowerCase();
  const n = (re) => (t.match(re) ?? []).length;
  const score = [
    ['Christmas light installation', n(/christmas lights?|holiday lights?|holiday lighting/g) * 3],
    ['Paintless dent repair', n(/paintless|\bpdr\b|hail damage|\bdents?\b/g) * 2],
    ['Boat detailing', n(/\bboats?\b|marine|yachts?|pontoons?/g) * (n(/detail/g) ? 1 : 0)],
    ['Mobile car detailing', n(/detailing|ceramic coating|paint correction|interior detail/g)],
    ['House painting', n(/\bpainters?\b|painting|cabinet refinish|drywall/g)],
    ['Lawn care', n(/\blawns?\b|mowing|landscap|yard|sod\b|mulch/g)],
  ].sort((a, b) => b[1] - a[1]);
  return score[0][1] >= 3 ? score[0][0] : null;
}

/** "Tampa, FL" from a Google address ("123 Main St, Tampa, FL 33604, USA"). */
export function cityOf(address = '') {
  const m = address.match(/,\s*([^,]+),\s*([A-Z]{2})\s+\d{5}/);
  return m ? `${m[1].trim()}, ${m[2]}` : '';
}

/** The email they get: thanks, the link, what it fixes on their current site, one question. No price. */
export function inboundEmail({ name, link, reasons = [], improvements = [], sender }) {
  const fix = reasons.length ? weakness(reasons) : gap(improvements);
  const what = fix ? `It's built from your own site, and fixes the main thing I noticed there: ${fix}.\n\n` : "It's built from your own site: your services, your reviews and your photos where you have them.\n\n";
  return {
    subject: `Your new website preview – ${name}`,
    body: `Hi,\n\nThanks for asking. Here's the preview of a new website for ${name}:\n${link}\n\n${what}Want it? Just reply to this email, and it can be live this week. Happy to change anything first.\n\n${signature(sender)}`,
  };
}

async function fail(reason, req) {
  await mkdir(path.join(root, 'outbox'), { recursive: true });
  await save('outbox/inbound-failed.json', { reason, request: req, at: new Date().toISOString() });
  console.error(`Not built: ${reason}`);
  process.exit(2);
}

async function build() {
  const req = JSON.parse(process.env.INBOUND || '{}');
  const business = String(req.business ?? '').trim(), website = String(req.website ?? '').trim(), email = String(req.email ?? '').trim().toLowerCase();
  if (!business || !website || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || JUNK_EMAIL.test(email)) return fail('the form had no business name, website or valid email', req);
  const config = await json('config.json', {});
  const dnc = (await json('do-not-contact.json', { entries: [] })).entries;
  const stored = await json(LEADS, { about: 'Preview requests from the neonsignsites.com form (pipeline/inbound.mjs). Built and emailed at once, without the daily list.', leads: [] });
  if (stored.leads.some((l) => l.email === email && Date.now() - Date.parse(l.requestedAt) < 7 * 864e5)) return fail(`${email} already asked this week`, req);

  // 1. Their Google listing: rating, reviews, address, phone (one Text Search request, counted).
  const key = (process.env.GOOGLE_PLACES_API_KEY || process.env.NEON_GOOGLE_PLACES_API_KEY || '').trim();
  const isMaps = /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(website);
  const host = isMaps ? '' : hostOf(/^https?:/i.test(website) ? website : `https://${website}`);
  let place = null;
  if (key) {
    const usage = await json('leads/places-usage.json', { months: {}, queries: {} });
    const month = (usage.months[monthOf()] ??= { requests: 0 });
    if (month.requests < (config.places?.monthlyRequestCap ?? 600)) {
      const res = await searchPage(key, host ? `${business} ${host}` : business).catch(() => null);
      month.requests += 1;
      await save('leads/places-usage.json', usage);
      const places = res?.places ?? [];
      place = places.find((p) => host && hostOf(p.websiteUri ?? '') === host) ?? (host ? null : places[0]) ?? places.find((p) => (p.displayName?.text ?? '').toLowerCase().includes(business.toLowerCase().split(/\s+/)[0])) ?? null;
    }
  }
  const site = place?.websiteUri ?? (host ? `https://${host}/` : null);
  if (!site) return fail('no website to rebuild from (a Google Maps link without a website on the listing)', req);
  const lead = {
    placeId: place?.id ?? `form-${slugify(business)}`, name: place?.displayName?.text ?? business, website: site,
    address: place?.formattedAddress ?? '', phone: place?.nationalPhoneNumber ?? '', rating: place?.rating ?? null,
    reviews: place?.userRatingCount ?? 0, mapsUrl: place?.googleMapsUri ?? '', city: cityOf(place?.formattedAddress ?? ''),
    email, source: 'form', requestedAt: new Date().toISOString(),
  };
  const no = blocked(lead, dnc);
  if (no) return fail(`on the do-not-contact list (${no.email ?? no.domain ?? no.name})`, req);

  // 2. Their site: what is wrong with it (for the email) and what trade it is.
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  let text = '';
  try {
    Object.assign(lead, await checkSite({ ...lead }, browser), { email });
    const page = await browser.newPage();
    await page.goto(site, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
  } finally { await browser.close(); }
  lead.trade = tradeOf(`${business} ${text}`);
  if (!lead.trade || !kitFor(lead.trade)) return fail(`their trade is not one we have a design for yet (site: ${site})`, req);
  // No listing found: the town from an address on their own site ("Tampa, FL 33604"), if there is one.
  if (!lead.city) { const m = text.match(/([A-Z][A-Za-z .'-]{1,30}),\s*([A-Z]{2})\s+\d{5}/); lead.city = m ? `${m[1].trim()}, ${m[2]}` : ''; }
  stored.leads.push(lead);
  await save(LEADS, stored);

  // 3. The preview, with a direct AI call (no batch: speed first), then the same checks as every preview.
  const r = spawnSync(process.execPath, [path.join(root, 'pipeline', 'cli.mjs'), '--place', lead.placeId, '--fresh'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  process.stdout.write(r.stdout ?? '');
  const slug = slugify(cleanName(lead.name, lead.city));
  const check = await readFile(path.join(root, 'demos', slug, 'check.txt'), 'utf8').catch(() => null);
  if (r.status !== 0 || check === null) return fail(`the build stopped: ${(r.stderr || r.stdout || '').trim().split('\n').at(-1)}`, req);
  const problems = check.split('\n').filter((l) => /First screen:|did not load|Not built/.test(l));
  if (problems.length) return fail(`the preview needs a look first: ${problems.join(' ')}`, req);

  const link = `${(config.previewBase ?? 'https://neonsignsites.com/p/').replace(/\/?$/, '/')}${slug}/`;
  const mail = inboundEmail({ name: cleanName(lead.name, lead.city), link, reasons: lead.reasons, improvements: lead.improvements, sender: config.sender });
  await mkdir(path.join(root, 'outbox'), { recursive: true });
  await save(`outbox/inbound-${slug}.json`, { slug, to: email, link, ...mail });
  console.log(`→ built demos/${slug}/, email ready in outbox/inbound-${slug}.json`);
  await writeFile(path.join(root, 'outbox', 'inbound-slug.txt'), slug);
}

async function gmail(from, { to, subject, body }) {
  const token = await accessToken(from);
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: mime({ from, fromName: 'Alon Katz', to, subject, body }) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gmail refused: ${r.status} ${j.error?.message ?? ''}`);
  return j;
}

async function send(slug) {
  const config = await json('config.json', {});
  const from = config.sending?.inbound ?? 'alon@neonsignsites.net';
  const o = await json(`outbox/inbound-${slug}.json`, null);
  if (!o) throw new Error(`No outbox/inbound-${slug}.json.`);
  // The push publishes it in about a minute; wait (HEAD, so it doesn't count as a visit) up to 10 minutes.
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(o.link, { method: 'HEAD' }).then((r) => r.ok, () => false);
    if (ok) break;
    if (i === 59) throw new Error(`${o.link} still does not open after 10 minutes.`);
    await new Promise((res) => setTimeout(res, 10000));
  }
  const j = await gmail(from, o);
  const sent = await json('leads/sent.json', []);
  const list = Array.isArray(sent) ? sent : sent.sent;
  list.push({ date: new Date().toISOString().slice(0, 10), slug, to: o.to, from, kind: 'inbound', subject: o.subject, messageId: j.id, threadId: j.threadId, sentAt: new Date().toISOString() });
  await save('leads/sent.json', sent);
  console.log(`→ emailed ${o.to} from ${from}: ${o.link}`);
}

async function tellAlon() {
  const config = await json('config.json', {});
  const from = config.sending?.inbound ?? 'alon@neonsignsites.net';
  const f = await json('outbox/inbound-failed.json', { reason: 'unknown (the run stopped)', request: JSON.parse(process.env.INBOUND || '{}') });
  const q = f.request ?? {};
  await gmail(from, { to: from, subject: `Preview request needs you: ${q.business ?? '?'}`, body: `A preview request from the site could not be done automatically, so nothing was sent to them.\n\nWhy: ${f.reason}\n\nBusiness: ${q.business ?? ''}\nWebsite: ${q.website ?? ''}\nEmail: ${q.email ?? ''}\n\nThe builder chat can do it by hand.` });
  console.log('→ told Alon');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const a = process.argv.slice(2);
  const run = a[0] === '--build' ? build() : a[0] === '--send' ? send(a[1]) : a[0] === '--tell-alon' ? tellAlon() : Promise.reject(new Error('node pipeline/inbound.mjs --build | --send <slug> | --tell-alon'));
  run.catch((e) => { console.error(e.message); process.exit(1); });
}
