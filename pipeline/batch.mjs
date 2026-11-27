#!/usr/bin/env node
// Builds previews for the best leads in a lead file, one after the other, and writes one summary to
// review them by:
//   npm run batch -- --file leads/found-2026-11-27.json --count 5 --dry     (who would be built)
//   npm run batch -- --file leads/found-2026-11-27.json --count 5
//   ... --kind weak            (only weak sites; default: weak first, then decent ones)
//   ... --trade "dent repair"  (only trades whose name contains this)
//   ... --place <id>,<id>      (exactly these leads)
// Previews dropped after review go in leads/rejected.json, so no batch builds them again.
//
// Picks leads that have an email, a kit for their trade, no preview yet and no do-not-contact
// entry; weak sites first, then decent ones, trades taken in turn, most Google reviews first.
// Each preview is the usual `npm run lead`, in three steps so the AI step costs half: every lead is
// prepared (`--prepare`: their site, photos, logo, the request for Claude), the requests go to Claude
// as one Message Batch (most are answered within the hour, at most 24h; it polls every minute), then
// each preview is finished (`--finish <slug>`). The batch is saved in leads/ai-batches.json, so if this
// session dies: `npm run batch -- --resume <batch id>` picks it up. `--direct` calls Claude one lead
// at a time instead (full price, no wait).
// Nothing is sent: the summary (leads/batch-<date>.md) is for review, like every preview.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitFor, cleanName, anthropicKey } from './copy.mjs';
import { blocked } from './dnc.mjs';
import { TEST_TRADES, JUNK_EMAIL } from './find.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const slugify = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const KINDS = { weak: 'weak site', decent: 'decent site' };

/** The leads to build, in order. `built` holds the slugs and place IDs already in demos/. */
export function pick(leads, { count = 5, kinds = ['weak site', 'decent site'], built = new Set(), dnc = [], trade = '' } = {}) {
  const ok = leads.filter((l) => l.email && !JUNK_EMAIL.test(l.email) && (l.trade ?? '').toLowerCase().includes(trade.toLowerCase()) && kitFor(l.trade) && !TEST_TRADES.has(l.trade) && kinds.includes(l.kind) && !blocked(l, dnc)
    && !built.has(l.placeId) && !built.has(slugify(cleanName(l.name, l.city))));
  const out = [];
  for (const kind of kinds) {
    // Trades in turn, so a batch is not all lawn or all detailing.
    const queues = Object.values(Object.groupBy(ok.filter((l) => l.kind === kind), (l) => kitFor(l.trade)))
      .map((q) => q.sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0)));
    while (out.length < count && queues.some((q) => q.length)) for (const q of queues) if (q.length && out.length < count) out.push(q.shift());
  }
  return out;
}

async function builtAlready() {
  const built = new Set();
  // Dropped after review: never built again.
  for (const r of JSON.parse(await readFile(path.join(root, 'leads', 'rejected.json'), 'utf8').catch(() => '[]'))) built.add(r.placeId);
  for (const slug of await readdir(path.join(root, 'demos'))) {
    // A preview, or one prepared and waiting for its batch; a folder left by a failed build is not.
    const site = await readFile(path.join(root, 'demos', slug, 'site.json'), 'utf8').then(JSON.parse).catch(() => null)
      ?? await readFile(path.join(root, 'demos', slug, '.build.json'), 'utf8').then((t) => JSON.parse(t).lead).catch(() => null);
    if (!site) continue;
    built.add(slug);
    if (site.placeId) built.add(site.placeId);
  }
  return built;
}

const cli = (...a) => spawnSync(process.execPath, [path.join(root, 'pipeline', 'cli.mjs'), ...a], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
const lastErr = (r) => (r.stderr ?? '').trim().split('\n').at(-1);
const BATCHES = path.join(root, 'leads', 'ai-batches.json');
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Sends the prepared requests as one Message Batch and records it (for --resume). */
async function submit(client, slugs, leads) {
  const requests = [];
  for (const [i, slug] of slugs.entries()) {
    const { params } = JSON.parse(await readFile(path.join(root, 'demos', slug, '.ai-request.json'), 'utf8'));
    requests.push({ custom_id: `p${i}`, params });
  }
  const batch = await client.messages.batches.create({ requests });
  const all = JSON.parse(await readFile(BATCHES, 'utf8').catch(() => '[]'));
  all.push({ id: batch.id, created: new Date().toISOString(), map: Object.fromEntries(slugs.map((s, i) => [`p${i}`, s])), leads, done: false });
  await writeFile(BATCHES, JSON.stringify(all, null, 1) + '\n');
  console.log(`Batch ${batch.id}: ${requests.length} requests sent. Waiting for Claude (usually under an hour).`);
  return batch.id;
}

/** Waits for the batch, writes each answer to demos/<slug>/.ai-result.json; returns the slugs. */
async function collect(client, id) {
  const all = JSON.parse(await readFile(BATCHES, 'utf8'));
  const entry = all.find((b) => b.id === id);
  if (!entry) throw new Error(`Batch ${id} is not in leads/ai-batches.json.`);
  for (let last = '';;) {
    const b = await client.messages.batches.retrieve(id);
    const c = b.request_counts;
    const now = `${c.succeeded + c.errored + c.expired + c.canceled} of ${c.processing + c.succeeded + c.errored + c.expired + c.canceled} answered`;
    if (now !== last) console.log(`${new Date().toISOString().slice(11, 16)} ${now}`);
    last = now;
    if (b.processing_status === 'ended') break;
    await sleep(60_000);
  }
  for await (const r of await client.messages.batches.results(id)) {
    const slug = entry.map[r.custom_id];
    if (!slug) continue;
    // Errored or expired: no answer file, and --finish asks Claude directly for that one.
    if (r.result.type === 'succeeded') await writeFile(path.join(root, 'demos', slug, '.ai-result.json'), JSON.stringify(r.result.message));
    else console.log(`${slug}: batch ${r.result.type}${r.result.error ? ` (${r.result.error.error?.message ?? r.result.error.type})` : ''}: a direct call instead`);
  }
  return entry;
}

async function markDone(id) {
  const all = JSON.parse(await readFile(BATCHES, 'utf8'));
  for (const b of all) if (b.id === id) b.done = true;
  await writeFile(BATCHES, JSON.stringify(all, null, 1) + '\n');
}

async function summary(file, results) {
  const lines = [`# Batch ${new Date().toISOString().slice(0, 10)}${file ? ` from ${file}` : ''}`, '',
    'Look at each desktop.jpg, phone.jpg and check.txt before anything is sent. Nothing has been sent.', ''];
  for (const { l, slug, error } of results) {
    lines.push(`## ${l.name} (${l.kind}, ${l.trade}, ${l.reviews} reviews)`, '');
    if (error) { lines.push(`Failed: ${error}`, ''); continue; }
    const check = await readFile(path.join(root, 'demos', slug, 'check.txt'), 'utf8').catch(() => '');
    const site = await readFile(path.join(root, 'demos', slug, 'site.json'), 'utf8').then(JSON.parse).catch(() => ({}));
    lines.push(`- Preview: demos/${slug}/ (desktop.jpg, phone.jpg, email.txt)`, `- Site: ${l.website}`,
      `- Why them: ${(l.reasons?.length ? l.reasons : l.improvements ?? []).join(', ') || '—'}`,
      `- Pitch: ${site.pitch === 'photos' ? 'PHOTOS (too few photos of their work: no gallery; the email asks them for job photos)' : 'their site'}`, '', check.trim(), '');
  }
  const out = path.join(root, 'leads', `batch-${new Date().toISOString().slice(0, 10)}.md`);
  const earlier = await readFile(out, 'utf8').catch(() => '');
  await writeFile(out, (earlier ? `${earlier.trimEnd()}\n\n---\n\n` : '') + lines.join('\n') + '\n');
  console.log(`\nSummary for review: ${path.relative(root, out)}`);
}

/** Finishes every answered (or failed) lead of a batch. */
async function finishAll(entry) {
  const results = [];
  for (const [, slug] of Object.entries(entry.map)) {
    const l = entry.leads.find((x) => x.slug === slug);
    console.log(`\n=== ${l.name}`);
    const r = cli('--finish', slug);
    process.stdout.write(r.stdout ?? '');
    if (r.status !== 0) console.log(`Failed: ${lastErr(r)}`);
    results.push({ l, slug, error: r.status !== 0 ? lastErr(r) : null });
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  const client = anthropicKey() ? new (await import('@anthropic-ai/sdk')).default({ apiKey: anthropicKey() }) : null;
  if (arg('resume')) {
    if (!client) throw new Error('No ANTHROPIC_API_KEY (or NEON_ANTHROPIC_API_KEY).');
    const entry = await collect(client, arg('resume'));
    await summary(null, await finishAll(entry));
    await markDone(entry.id);
    return;
  }
  const file = arg('file');
  if (!file) { console.log('npm run batch -- --file leads/found-<date>.json [--count 5] [--kind weak|decent|weak,decent] [--trade "<part of trade>"] [--place <id>,<id>] [--direct] [--dry]\nnpm run batch -- --resume <batch id>'); process.exit(1); }
  const leads = JSON.parse(await readFile(path.resolve(file), 'utf8'));
  const kinds = (arg('kind') ?? 'weak,decent').split(',').map((k) => KINDS[k.trim()]).filter(Boolean);
  const dnc = JSON.parse(await readFile(path.join(root, 'do-not-contact.json'), 'utf8')).entries;
  // --place id1,id2: exactly these leads (e.g. to rebuild ones dropped before), still never a do-not-contact one.
  const chosen = arg('place') ? arg('place').split(',').map((id) => leads.find((l) => l.placeId === id.trim())).filter((l) => l && !blocked(l, dnc))
    : pick(leads, { count: +(arg('count') ?? 5), kinds, built: await builtAlready(), dnc, trade: arg('trade') ?? '' });
  if (!chosen.length) { console.log('No lead left to build in this file (needs an email, a kit, no preview yet).'); return; }
  const direct = args.includes('--direct') || !client;
  for (const l of chosen) console.log(`- ${l.kind} | ${l.trade} | ${l.reviews} reviews | ${l.name} | ${(l.reasons?.length ? l.reasons : l.improvements ?? []).join(', ')}`);
  console.log(`${chosen.length} previews, about ${chosen.length * (direct ? 5 : 2.5)} cents of AI wording${direct ? '' : ' (one Message Batch, half price)'}.`);
  if (args.includes('--dry')) return;
  const rel = path.relative(root, path.resolve(file));

  // One at a time, full price (no key: kit wording only).
  if (direct) {
    const results = [];
    for (const l of chosen) {
      console.log(`\n=== ${l.name}`);
      const r = cli('--place', l.placeId);
      process.stdout.write(r.stdout ?? '');
      const slug = (r.stdout ?? '').match(/→ demos\/([^/]+)\//)?.[1];
      if (r.status !== 0 || !slug) console.log(`Failed: ${lastErr(r)}`);
      results.push({ l, slug, error: r.status !== 0 || !slug ? lastErr(r) : null });
    }
    return summary(rel, results);
  }

  // 1. Prepare all. A lead with hand-written wording needs no AI and is built right away.
  const results = [];
  const waiting = [];
  for (const l of chosen) {
    console.log(`\n=== ${l.name} (preparing)`);
    const r = cli('--place', l.placeId, '--prepare');
    process.stdout.write(r.stdout ?? '');
    const prepared = (r.stdout ?? '').match(/→ prepared demos\/([^/]+)\//)?.[1];
    const built = (r.stdout ?? '').match(/→ demos\/([^/]+)\//)?.[1];
    if (prepared) waiting.push({ ...l, slug: prepared });
    else if (r.status === 0 && built) results.push({ l, slug: built });
    else { console.log(`Failed: ${lastErr(r)}`); results.push({ l, error: lastErr(r) }); }
  }
  // 2. One batch for all of them; 3. finish each.
  if (waiting.length) {
    const brief = waiting.map((l) => ({ slug: l.slug, name: l.name, kind: l.kind, trade: l.trade, reviews: l.reviews, website: l.website, reasons: l.reasons, improvements: l.improvements }));
    const id = await submit(client, waiting.map((l) => l.slug), brief);
    const entry = await collect(client, id);
    results.push(...await finishAll(entry));
    await markDone(id);
  }
  await summary(rel, results);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
