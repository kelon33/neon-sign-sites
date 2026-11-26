#!/usr/bin/env node
// Builds previews for many leads in one go: every lead in a leads/ file with a weak site, an email and
// a kit, not built yet, not on the do-not-contact list. One at a time; a failure skips that lead.
//   npm run batch -- --file leads/us-2026-11-26-mobile-lawn.json [--max 10] [--no-ai] [--city "Dallas, TX"]
// Then look at each demos/<slug>/desktop.jpg, phone.jpg and check.txt before showing them to Alon.

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { kitFor } from './copy.mjs';
import { blocked } from './dnc.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Leads worth a preview, best first (most Google reviews: established businesses). */
export function candidates(leads, { built = new Set(), dnc = [], city = '' } = {}) {
  return leads
    .filter((l) => l.kind === 'weak site' && l.email && l.website && kitFor(l.trade))
    .filter((l) => !built.has(l.placeId) && !blocked(l, dnc) && (!city || l.city === city))
    .sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0));
}

async function main() {
  const { values } = parseArgs({ options: { file: { type: 'string' }, max: { type: 'string', default: '10' }, 'no-ai': { type: 'boolean', default: false }, city: { type: 'string' } } });
  if (!values.file) throw new Error('Which leads? --file leads/<file>.json');
  const leads = JSON.parse(await readFile(path.resolve(root, values.file), 'utf8'));
  const built = new Set();
  for (const slug of await readdir(path.join(root, 'demos'))) {
    const f = path.join(root, 'demos', slug, 'lead.json');
    if (existsSync(f)) built.add(JSON.parse(await readFile(f, 'utf8')).placeId);
  }
  const dnc = JSON.parse(await readFile(path.join(root, 'do-not-contact.json'), 'utf8')).entries;
  const list = candidates(Array.isArray(leads) ? leads : [], { built, dnc, city: values.city }).slice(0, Number(values.max));
  console.log(`${list.length} previews to build.`);
  const done = [];
  const failed = [];
  for (const [i, lead] of list.entries()) {
    console.log(`\n[${i + 1}/${list.length}] ${lead.name} (${lead.city})`);
    const r = spawnSync('node', [path.join(root, 'pipeline/cli.mjs'), '--place', lead.placeId, ...(values['no-ai'] ? ['--no-ai'] : [])], { stdio: 'inherit', cwd: root });
    (r.status === 0 ? done : failed).push(lead.name);
  }
  console.log(`\nBuilt ${done.length}${failed.length ? `, failed ${failed.length}: ${failed.join(', ')}` : ''}. Check each preview's screenshots and check.txt.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(`Stopped: ${e.message}`); process.exitCode = 1; });
