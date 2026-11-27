#!/usr/bin/env node
// The wording library: the general wording of every reviewed preview, saved per trade in wording/,
// so new previews start from proven lines instead of plain defaults, and --no-ai previews (free)
// still read well.
//   npm run wording            harvest demos/*/site.json into wording/<trade>.json and show the counts
//
// Only general wording is kept (headline, section titles, steps, contact and gallery titles). The
// business name and town become {name} and {town}; any line with a number, an email or a web address
// is skipped. Services, prices, reviews and facts always come from each business's own site, so
// they are never reused. A reused line that makes a trust claim (guarantee, insured...) is used only
// if the new business's site makes it too (unbackedClaim in copy.mjs).

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitFor, unbackedClaim } from './copy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(root, 'wording');
export const GENERAL = ['headline', 'servicesTitle', 'servicesIntro', 'whyTitle', 'howTitle', 'contactTitle', 'galleryTitle', 'alsoTitle', 'steps', 'sectionTitle', 'sectionIntro'];
export const slugOf = (trade) => trade.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Which trade a preview is for: site.json "trade", else its kicker ("Mobile car detailing · Tampa"). */
export function tradeOf(d) {
  if (d.trade) return d.trade;
  const k = (d.kicker ?? '').split('·')[0].toLowerCase();
  if (/dent/.test(k)) return 'Paintless dent repair';
  if (/christmas|holiday/.test(k) || d.kit === 'holiday') return 'Christmas light installation';
  if (/boat|marine/.test(k)) return 'Boat detailing';
  if (/paint/.test(k) || d.kit === 'painting') return 'House painting';
  return d.kit === 'detailing' ? 'Mobile car detailing' : 'Lawn care';
}

/** A line made general: name and town become placeholders; null when it is too specific to reuse. */
export function generalize(s, { name, town }) {
  if (typeof s !== 'string' || !s.trim()) return null;
  if (/\d|@|https?:|www\./i.test(s)) return null;
  // Lines found to promise what businesses don't (kept out even though older previews have them).
  if (/shining by tonight/i.test(s)) return null;
  let out = s;
  const words = (name ?? '').split(/[\s&,.-]+/).filter((w) => w.length > 3 && !/^(mobile|detailing|lawn|care|services?|landscaping|painting|lighting|repair|auto|llc|inc)$/i.test(w));
  if (name) out = out.split(name).join('{name}');
  if (town) out = out.split(town).join('{town}');
  // Any other word of their name left (a nickname, "Ray handles..."): too specific.
  if (words.some((w) => new RegExp(`\\b${w.replace(/[^a-z0-9]/gi, '')}\\b`, 'i').test(out))) return null;
  return out;
}

/** The general wording of one preview. */
export function harvestOne(d) {
  const town = (d.areas?.[0] ?? '').trim();
  const g = (s) => generalize(s, { name: d.name, town });
  const section = d.mobile ?? d.highlights;
  const entry = {};
  for (const f of ['headline', 'servicesTitle', 'servicesIntro', 'whyTitle', 'howTitle', 'contactTitle', 'galleryTitle', 'alsoTitle']) { const v = g(d[f]); if (v) entry[f] = v; }
  if (section) { const t = g(section.title); const i = g(section.intro); if (t) entry.sectionTitle = t; if (i) entry.sectionIntro = i; }
  const steps = (d.steps ?? []).map((s) => ({ name: g(s.name), text: g(s.text) }));
  if (steps.length === 3 && steps.every((s) => s.name && s.text)) entry.steps = steps;
  return entry;
}

/** The library for a trade, or []. */
export async function library(trade) {
  return readFile(path.join(DIR, `${slugOf(trade)}.json`), 'utf8').then((j) => JSON.parse(j).entries).catch(() => []);
}

/** Proven general wording laid over a draft: each field from one library entry, chosen by the
 *  business name so neighbours differ; claims kept only if their own site makes them too. */
export function fromLibrary(copy, entries, { name, town, text }) {
  if (!entries.length) return copy;
  const seed = [...(name ?? '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const out = { ...copy };
  const fill = (s) => s.split('{name}').join(name ?? '').split('{town}').join(town ?? '');
  const ok = (s) => !unbackedClaim(s, text ?? '');
  for (const [i, f] of ['headline', 'servicesTitle', 'servicesIntro', 'whyTitle', 'howTitle', 'contactTitle', 'galleryTitle', 'alsoTitle'].entries()) {
    const have = entries.filter((e) => e[f] && ok(fill(e[f])));
    if (have.length) out[f] = fill(have[(seed + i) % have.length][f]);
  }
  const steps = entries.filter((e) => e.steps && e.steps.every((s) => ok(fill(`${s.name} ${s.text}`))));
  if (steps.length) out.steps = steps[seed % steps.length].steps.map((s) => ({ name: fill(s.name), text: fill(s.text) }));
  const key = out.mobile ? 'mobile' : out.highlights ? 'highlights' : null;
  const sec = entries.filter((e) => e.sectionTitle && ok(fill(`${e.sectionTitle} ${e.sectionIntro ?? ''}`)));
  if (key && sec.length) { const e = sec[seed % sec.length]; out[key] = { ...out[key], title: fill(e.sectionTitle), ...(e.sectionIntro ? { intro: fill(e.sectionIntro) } : {}) }; }
  return out;
}

async function main() {
  const byTrade = {};
  // Only reviewed previews: a preview is committed only after review, so read the committed ones.
  const committed = new Set(execFileSync('git', ['ls-files', 'demos/*/site.json'], { cwd: root, encoding: 'utf8' }).split('\n').map((f) => f.split('/')[1]).filter(Boolean));
  for (const slug of (await readdir(path.join(root, 'demos'))).sort()) {
    if (!committed.has(slug)) continue;
    const d = await readFile(path.join(root, 'demos', slug, 'site.json'), 'utf8').then(JSON.parse).catch(() => null);
    if (!d || !kitFor(tradeOf(d))) continue;
    const entry = harvestOne(d);
    if (Object.keys(entry).length < 3) continue;
    (byTrade[tradeOf(d)] ??= []).push({ from: slug, ...entry });
  }
  await mkdir(DIR, { recursive: true });
  for (const [trade, entries] of Object.entries(byTrade)) {
    await writeFile(path.join(DIR, `${slugOf(trade)}.json`), JSON.stringify({ trade, about: 'General wording from reviewed previews (npm run wording). {name} and {town} are filled in per business.', entries }, null, 1) + '\n');
    console.log(`${trade}: ${entries.length} preview${entries.length === 1 ? '' : 's'} → wording/${slugOf(trade)}.json`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
