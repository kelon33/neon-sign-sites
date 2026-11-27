#!/usr/bin/env node
// Neon Sign Sites: builds a premium one-page site for a local service business from a data file.
//   node generator/render.mjs demos/<business>/site.json   → index.html next to it
//   site.json "kit": lawn (default) | detailing | painting | holiday
// The data comes from the business's own website and Google listing; nothing is invented: no
// made-up reviews, numbers or claims. A thin bar marks a preview as a preview until launch.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { renderLawn } from './kits/lawn.mjs';
import { renderDetailing } from './kits/detailing.mjs';
import { renderPainting } from './kits/painting.mjs';
import { renderHoliday } from './kits/holiday.mjs';
import { withStockHero, CREDIT_CSS } from './stock.mjs';

// One kit per trade: its own look and sections, the same data file shape where they overlap.
// site.json picks one with "kit" (lawn when it has none).
export const KITS = { lawn: renderLawn, detailing: renderDetailing, painting: renderPainting, holiday: renderHoliday };

export function renderSite(d) {
  const kit = KITS[d.kit ?? 'lawn'];
  if (!kit) throw new Error(`Unknown kit "${d.kit}". Kits: ${Object.keys(KITS).join(', ')}`);
  // No usable photo of their own: a licensed real photo for the trade, credited in the hero.
  const { d: data, credit } = withStockHero(d);
  const html = kit(data);
  return credit ? html.replace('<section class="hero">', `<section class="hero">${credit}`).replace('</style>', `${CREDIT_CSS}</style>`) : html;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const file = process.argv[2];
  if (!file) { console.log('node generator/render.mjs demos/<business>/site.json'); process.exit(1); }
  const data = JSON.parse(await readFile(file, 'utf8'));
  const out = path.join(path.dirname(file), 'index.html');
  await writeFile(out, renderSite(data));
  console.log(`→ ${out}`);
}
