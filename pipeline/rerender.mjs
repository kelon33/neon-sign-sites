#!/usr/bin/env node
// Re-renders previews after a kit or site.json change: index.html (what goes live) and preview.html
// (the same page with its images inside, for looking at locally), without asking the AI again.
//   npm run rerender                  every preview in demos/
//   npm run rerender -- <slug> ...    exactly these
// Screenshots are not retaken; run npm run fold afterwards.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSite } from '../generator/render.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function rerender(slug) {
  const dir = path.join(root, 'demos', slug);
  const d = JSON.parse(await readFile(path.join(dir, 'site.json'), 'utf8'));
  const html = renderSite(d);
  await writeFile(path.join(dir, 'index.html'), html);
  let inline = html;
  for (const m of [...new Set([...html.matchAll(/(?:src|data-full)="((?:img\/[^"]+)|logo\.png)"/g)].map((x) => x[1]))]) {
    const b64 = await readFile(path.join(dir, m)).then((b) => b.toString('base64'), () => null);
    if (b64) inline = inline.split(`"${m}"`).join(`"data:image/${m.endsWith('png') ? 'png' : 'jpeg'};base64,${b64}"`);
  }
  await writeFile(path.join(dir, 'preview.html'), inline);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const given = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const all = [];
  for (const s of given.length ? given : await readdir(path.join(root, 'demos'))) {
    if (await readFile(path.join(root, 'demos', s, 'site.json')).then(() => true, () => false)) all.push(s);
  }
  for (const s of all) await rerender(s);
  console.log(`Re-rendered ${all.length} previews (index.html and preview.html). Run npm run fold.`);
}
