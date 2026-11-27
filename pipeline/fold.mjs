#!/usr/bin/env node
// The first screen must read as a whole page: the headline, every hero button and the Google rating
// fully visible without scrolling, on a laptop, a desktop and phones.
//   npm run fold                  every preview in demos/
//   npm run fold -- <slug> ...    some of them
// Exits non-zero when anything is cut off (the pipeline writes the same check into check.txt).

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SCREENS = [
  { name: 'laptop 1366×768', width: 1366, height: 768 },
  { name: 'desktop 1440×900', width: 1440, height: 900 },
  { name: 'iPhone 390×844', width: 390, height: 844 },
  { name: 'small phone 375×667', width: 375, height: 667 },
];

/** What is cut off below the first screen, per screen size: [] when everything fits. */
export async function foldProblems(browser, file) {
  const problems = [];
  for (const s of SCREENS) {
    const page = await browser.newPage({ viewport: { width: s.width, height: s.height } });
    await page.goto(`file://${file}`, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const cut = await page.evaluate((h) => {
      const hero = document.querySelector('.hero');
      if (!hero) return ['no hero section'];
      // The preview bar sits above the page; everything in the hero must end above the fold.
      const items = [...hero.querySelectorAll('h1, .btn, .rating')];
      return items.filter((el) => el.getBoundingClientRect().bottom > h + 1)
        .map((el) => (el.classList.contains('rating') ? 'Google rating' : el.tagName === 'H1' ? 'headline' : `button "${el.textContent.trim()}"`));
    }, s.height);
    if (cut.length) problems.push(`${s.name}: ${cut.join(', ')} below the fold`);
    await page.close();
  }
  return problems;
}

async function main() {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const slugs = process.argv.slice(2).length ? process.argv.slice(2) : (await readdir(path.join(root, 'demos'))).sort();
  const browser = await chromium.launch();
  let bad = 0;
  try {
    for (const slug of slugs) {
      const p = await foldProblems(browser, path.join(root, 'demos', slug, 'index.html'));
      if (p.length) bad++;
      console.log(`${p.length ? '✗' : '✓'} ${slug}${p.length ? `\n    ${p.join('\n    ')}` : ''}`);
    }
  } finally { await browser.close(); }
  console.log(`\n${slugs.length - bad} of ${slugs.length} fit the first screen.`);
  if (bad) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
