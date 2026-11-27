#!/usr/bin/env node
// Cheap review of many previews at once (saves Claude usage: one small image per 6 previews instead of
// two full-page screenshots each):
//   npm run review                      (every preview in demos/ not committed yet)
//   npm run review -- <slug> <slug>     (exactly these)
// Writes review/sheet-<n>.jpg: 6 previews each, the first screen on a laptop and on a phone, numbered;
// and review/digest.md: one line per preview with only the flags that need a look. Open a preview's
// full desktop.jpg / phone.jpg only when its tile or its line shows a problem. review/ is not committed.

import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'review');
const PER_SHEET = 6;

/** check.txt lines worth a human look; the routine ones are left out of the digest. */
const ROUTINE = /^(Only \d+ gallery photos|No reviews on the site|Kept the hand-written wording|No postal address yet)/;
export function flags(check) {
  return check.split('\n').map((l) => l.replace(/^-\s*/, '').trim()).filter((l) => l && l !== 'Nothing flagged.' && !ROUTINE.test(l))
    .map((l) => (l.startsWith("Claude's notes:") ? `notes: ${l.slice(15).trim().slice(0, 220)}${l.length > 235 ? '…' : ''}` : l));
}

async function uncommitted() {
  const tracked = new Set(execFileSync('git', ['ls-files', 'demos/*/site.json'], { cwd: root, encoding: 'utf8' }).split('\n').map((f) => f.split('/')[1]));
  const out = [];
  for (const slug of await readdir(path.join(root, 'demos'))) {
    if (tracked.has(slug)) continue;
    if (await readFile(path.join(root, 'demos', slug, 'site.json')).then(() => true, () => false)) out.push(slug);
  }
  return out.sort();
}

async function main() {
  const slugs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const list = slugs.length ? slugs : await uncommitted();
  if (!list.length) { console.log('Nothing to review (no uncommitted previews).'); return; }
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const lines = [];
  const items = [];
  for (const [i, slug] of list.entries()) {
    const dir = path.join(root, 'demos', slug);
    const site = JSON.parse(await readFile(path.join(dir, 'site.json'), 'utf8'));
    const check = await readFile(path.join(dir, 'check.txt'), 'utf8').catch(() => '');
    const to = (await readFile(path.join(dir, 'email.txt'), 'utf8').catch(() => '')).match(/^To: (.*)$/m)?.[1] || 'NO EMAIL';
    const f = flags(check);
    lines.push(`${i + 1}. ${slug} | ${site.trade ?? site.kit} | ${site.pitch === 'photos' ? 'PHOTO PITCH' : 'site'} | gallery ${site.gallery?.length ?? 0} | hero ${site.heroImage ? 'theirs' : 'stock'} | ${site.reviews?.length ?? 0} reviews | ${to}${f.length ? `\n   - ${f.join('\n   - ')}` : ''}`);
    items.push({ n: i + 1, slug, name: site.name, dir });
  }
  await writeFile(path.join(OUT, 'digest.md'), lines.join('\n') + '\n');

  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 300 }, deviceScaleFactor: 1 });
    for (let s = 0; s * PER_SHEET < items.length; s++) {
      const tiles = items.slice(s * PER_SHEET, (s + 1) * PER_SHEET).map((it) => `
        <div class="t"><b>${it.n}. ${it.name.replace(/</g, '&lt;')}</b><div class="row">
          <div class="d" style="background-image:url('file://${it.dir}/desktop.jpg')"></div>
          <div class="p" style="background-image:url('file://${it.dir}/phone.jpg')"></div></div></div>`).join('');
      const html = path.join(OUT, `sheet-${s + 1}.html`);
      await writeFile(html, `<style>body{margin:0;font:13px system-ui;background:#fff}.g{display:grid;grid-template-columns:repeat(3,520px);gap:10px;padding:10px}
        .row{display:flex;gap:6px}.d,.p{background-size:100% auto;background-repeat:no-repeat;border:1px solid #ccc}
        .d{width:400px;height:269px}.p{width:110px;height:238px}b{display:block;margin:0 0 4px;white-space:nowrap;overflow:hidden}</style>
        <div class="g">${tiles}</div>`);
      await page.goto(`file://${html}`, { waitUntil: 'load' });
      await rm(html);
      await page.screenshot({ path: path.join(OUT, `sheet-${s + 1}.jpg`), type: 'jpeg', quality: 60, fullPage: true });
    }
  } finally { await browser.close(); }
  console.log(lines.join('\n'));
  console.log(`\n${Math.ceil(items.length / PER_SHEET)} sheets in review/ (sheet-1.jpg …), digest in review/digest.md`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
