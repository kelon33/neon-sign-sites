#!/usr/bin/env node
// Builds previews for the best leads in a lead file, one after the other, and writes one summary to
// review them by:
//   npm run batch -- --file leads/found-2026-11-27.json --count 5 --dry     (who would be built)
//   npm run batch -- --file leads/found-2026-11-27.json --count 5
//   ... --kind weak            (only weak sites; default: weak first, then decent ones)
//
// Picks leads that have an email, a kit for their trade, no preview yet and no do-not-contact
// entry; weak sites first, then decent ones, trades taken in turn, most Google reviews first.
// Each preview is the usual `npm run lead -- --place <id>` (AI wording: a few cents each).
// Nothing is sent: the summary (leads/batch-<date>.md) is for review, like every preview.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitFor, cleanName } from './copy.mjs';
import { blocked } from './dnc.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const slugify = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const KINDS = { weak: 'weak site', decent: 'decent site' };

/** The leads to build, in order. `built` holds the slugs and place IDs already in demos/. */
export function pick(leads, { count = 5, kinds = ['weak site', 'decent site'], built = new Set(), dnc = [] } = {}) {
  const ok = leads.filter((l) => l.email && kitFor(l.trade) && kinds.includes(l.kind) && !blocked(l, dnc)
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
  for (const slug of await readdir(path.join(root, 'demos'))) {
    built.add(slug);
    const site = await readFile(path.join(root, 'demos', slug, 'site.json'), 'utf8').then(JSON.parse).catch(() => null);
    if (site?.placeId) built.add(site.placeId);
  }
  return built;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  const file = arg('file');
  if (!file) { console.log('npm run batch -- --file leads/found-<date>.json [--count 5] [--kind weak|decent|weak,decent] [--dry]'); process.exit(1); }
  const leads = JSON.parse(await readFile(path.resolve(file), 'utf8'));
  const kinds = (arg('kind') ?? 'weak,decent').split(',').map((k) => KINDS[k.trim()]).filter(Boolean);
  const dnc = JSON.parse(await readFile(path.join(root, 'do-not-contact.json'), 'utf8')).entries;
  const chosen = pick(leads, { count: +(arg('count') ?? 5), kinds, built: await builtAlready(), dnc });
  if (!chosen.length) { console.log('No lead left to build in this file (needs an email, a kit, no preview yet).'); return; }
  for (const l of chosen) console.log(`- ${l.kind} | ${l.trade} | ${l.reviews} reviews | ${l.name} | ${(l.reasons?.length ? l.reasons : l.improvements ?? []).join(', ')}`);
  console.log(`${chosen.length} previews, about ${chosen.length * 5} cents of AI wording.`);
  if (args.includes('--dry')) return;

  const lines = [`# Batch ${new Date().toISOString().slice(0, 10)} from ${path.relative(root, path.resolve(file))}`, '',
    'Look at each desktop.jpg, phone.jpg and check.txt before anything is sent. Nothing has been sent.', ''];
  for (const l of chosen) {
    console.log(`\n=== ${l.name}`);
    const r = spawnSync(process.execPath, [path.join(root, 'pipeline', 'cli.mjs'), '--place', l.placeId], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    process.stdout.write(r.stdout ?? '');
    const slug = (r.stdout ?? '').match(/→ demos\/([^/]+)\//)?.[1];
    lines.push(`## ${l.name} (${l.kind}, ${l.trade}, ${l.reviews} reviews)`, '');
    if (r.status !== 0 || !slug) {
      console.log(`Failed: ${(r.stderr ?? '').trim().split('\n').at(-1)}`);
      lines.push(`Failed: ${(r.stderr ?? '').trim().split('\n').at(-1)}`, '');
      continue;
    }
    const check = await readFile(path.join(root, 'demos', slug, 'check.txt'), 'utf8').catch(() => '');
    lines.push(`- Preview: demos/${slug}/ (desktop.jpg, phone.jpg, email.txt)`, `- Site: ${l.website}`,
      `- Why them: ${(l.reasons?.length ? l.reasons : l.improvements ?? []).join(', ') || '—'}`, '', check.trim(), '');
  }
  const out = path.join(root, 'leads', `batch-${new Date().toISOString().slice(0, 10)}.md`);
  await writeFile(out, lines.join('\n') + '\n');
  console.log(`\nSummary for review: ${path.relative(root, out)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
