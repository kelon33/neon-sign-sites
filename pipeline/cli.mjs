#!/usr/bin/env node
// One command from a lead to a draft site, screenshots and an email, ready for a human to approve:
//   npm run lead -- "Erick's Auto Detailing"     (a name, or part of one, from leads/)
//   npm run lead -- "..." --no-ai                 (ready-made kit wording only, free)
// Writes demos/<slug>/: site.json, index.html, img/, logo, desktop.jpg, phone.jpg,
// preview.html (one file with everything inside), email.txt and check.txt (what a human should look at).

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// Playwright is installed globally in the cloud sessions; require() finds it from any folder.
const { chromium } = createRequire(import.meta.url)('playwright');
import { scrapeSite } from './scrape.mjs';
import { photoCandidates, logoCandidate, galleryPlan, saveImage, thumbnail, pickHero } from './photos.mjs';
import { kitFor, detailingCopy, sharpen, verify, cleanName, splitWordmark } from './copy.mjs';
import { draftEmail } from './email.mjs';
import { renderSite } from '../generator/render.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const slugify = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function findLead(query) {
  const dir = path.join(root, 'leads');
  const found = [];
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.json')) continue;
    const data = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
    const list = Array.isArray(data) ? data : (data.results ?? data.leads ?? Object.values(data).find(Array.isArray) ?? []);
    for (const l of list) if (l?.name?.toLowerCase().includes(query.toLowerCase())) found.push(l);
  }
  return found;
}

async function main() {
  const query = arg('lead');
  if (!query) { console.log('npm run lead -- --lead "<business name>" [--no-ai]'); process.exit(1); }
  const leads = await findLead(query);
  if (!leads.length) throw new Error(`No lead matches "${query}" in leads/.`);
  const lead = leads.find((l) => l.website && l.email) ?? leads[0];
  if (leads.length > 1) console.log(`(${leads.length} matches; using ${lead.name})`);
  const kit = kitFor(lead.trade);
  if (kit !== 'detailing') throw new Error(`No automatic kit for "${lead.trade}" yet (detailing only).`);
  if (!lead.website || /instagram|facebook/.test(lead.website)) throw new Error('This lead has no website to rebuild from.');

  // People call the business by its plain name, not Google's keyword-stuffed one.
  lead.listedName = lead.name;
  lead.name = cleanName(lead.name, lead.city);
  const config = JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8'));
  const slug = slugify(lead.name);
  const out = path.join(root, 'demos', slug);
  await mkdir(path.join(out, 'img'), { recursive: true });
  const checks = [];
  const browser = await chromium.launch();
  try {
    // 1. Their site.
    console.log(`Reading ${lead.website}`);
    const site = await scrapeSite(browser, lead.website);
    if (!site) throw new Error('Their site did not load.');
    const text = site.pages.map((p) => p.text).join('\n\n');

    // 2. Photos and logo.
    const tool = await browser.newPage();
    const photos = [];
    for (const c of photoCandidates(site.imgs).slice(0, 24)) {
      const file = path.join(out, 'img', `photo-${photos.length + 1}.jpg`);
      const saved = await saveImage(tool, c.src, file);
      if (saved) photos.push({ file, rel: `img/photo-${photos.length + 1}.jpg`, ...saved, alt: c.alt });
    }
    console.log(`${photos.length} photos`);
    let logo = null;
    const lc = logoCandidate(site.imgs);
    if (lc) logo = await saveImage(tool, lc.src, path.join(out, 'logo.png'), { max: 360, logo: true });
    if (!logo) checks.push('No logo found: the header shows the name only.');
    else if (logo.dark && logo.transparent) checks.push('Logo is dark on a transparent background: shown on a white chip. Check it reads well.');

    // 3. Words: the kit's, then sharper ones from Claude when available.
    let copy = detailingCopy({ name: lead.name, city: lead.city, text });
    // The hero prefers a landscape photo; phone photos (all portrait) still work, cropped.
    let heroIndex = pickHero(photos);
    if (heroIndex >= 0 && photos[heroIndex].h >= photos[heroIndex].w) checks.push('Hero uses a portrait photo, cropped: check it looks good.');
    let order = photos.map((_, i) => i).filter((i) => i !== heroIndex);
    let alts = {};
    let wordmark = splitWordmark(lead.name);
    const useAi = !args.includes('--no-ai');
    if (useAi && !process.env.ANTHROPIC_API_KEY) checks.push('No ANTHROPIC_API_KEY: used the kit wording (no reviews, generic intro).');
    if (useAi && process.env.ANTHROPIC_API_KEY) {
      const thumbs = [];
      for (const p of photos) thumbs.push(await thumbnail(tool, p.file));
      console.log('Asking Claude for sharper wording and the photo choice');
      const ai = await sharpen({ kit, lead, text, draft: copy, thumbs });
      const r = ai.result;
      const merged = {
        ...copy,
        kicker: r.kicker, headline: r.headline, intro: r.intro,
        mobile: r.mobilePoints.length ? { title: r.mobileTitle, intro: r.mobileIntro, points: r.mobilePoints } : null,
        servicesTitle: r.servicesTitle, servicesIntro: r.servicesIntro,
        services: r.services.map((s) => ({ name: s.name, text: s.text, ...(s.price ? { price: s.price } : {}) })),
        also: r.also.map((n) => ({ name: n })),
        whyTitle: r.whyTitle, why: r.why, howTitle: r.howTitle, steps: r.steps,
        contactTitle: r.contactTitle, footerLine: r.footerLine, hours: r.hours, reviews: r.reviews,
      };
      const { copy: checked, dropped } = verify(merged, { text, facts: ai.facts });
      for (const k of Object.keys(checked)) if (checked[k] === null) checked[k] = copy[k];
      if (checked.steps.length < 3) checked.steps = copy.steps;
      if (checked.services.length < 3) checked.services = copy.services;
      copy = checked;
      for (const d of dropped) checks.push(`Dropped (not backed by their site): ${d}`);
      if (r.heroPhoto >= 1 && r.heroPhoto <= photos.length) heroIndex = r.heroPhoto - 1;
      const picked = r.galleryPhotos.map((n) => n - 1).filter((i) => i >= 0 && i < photos.length && i !== heroIndex);
      if (picked.length >= 4) order = [...new Set(picked)];
      alts = Object.fromEntries(r.photoAlts.map((a) => [a.photo - 1, a.alt]));
      wordmark = { top: r.wordmarkTop || lead.name, bottom: r.wordmarkBottom };
      if (r.notes) checks.push(`Claude's notes: ${r.notes}`);
      const u = ai.usage;
      console.log(`Claude: ${u.input_tokens} in, ${u.output_tokens} out`);
    }

    // 4. Gallery with no holes; the tall slot goes to a portrait photo when there is one.
    const plan = galleryPlan(order.length);
    let gallery = order.slice(0, plan.count).map((i) => ({ src: photos[i].rel, alt: alts[i] || photos[i].alt || `Detailing work by ${lead.name}` }));
    if (gallery.length) {
      gallery[0].size = 'big';
      if (plan.tall) {
        const p = gallery.findIndex((g, i) => i > 0 && photos[order[i]].h > photos[order[i]].w);
        const t = p > 0 ? p : 4 % gallery.length || 1;
        gallery.splice(Math.min(4, gallery.length - 1), 0, { ...gallery.splice(t, 1)[0], size: 'tall' });
      }
    }
    if (heroIndex < 0) checks.push('No photos at all: the hero has no picture. Find photos by hand.');
    if (gallery.length < 8) checks.push(`Only ${gallery.length} gallery photos.`);
    if (!copy.reviews.length) checks.push('No reviews on the site: the page shows the Google rating only.');

    // 5. The site.
    const email = lead.email || site.emails[0] || '';
    const data = {
      kit, name: lead.name, legalName: lead.name, preview: true,
      title: `${lead.name} | ${copy.kicker.split(' · ')[0]} in ${lead.city}`,
      description: `${copy.intro} ${lead.rating ? `${lead.rating.toFixed(1)} on Google from ${lead.reviews} reviews.` : ''}`.trim(),
      brand: '#1670ff', brandHi: '#52c6ff', accent: '#8fd0ff',
      logo: logo ? 'logo.png' : null, logoChip: !!(logo && (!logo.transparent || logo.dark)), wordmark,
      phone: lead.phone, email,
      heroImage: heroIndex >= 0 ? photos[heroIndex].rel : null,
      heroAlt: heroIndex >= 0 ? (alts[heroIndex] ?? '') : '',
      heroPosition: '60% 60%', heroPositionPhone: '60% 50%',
      rating: lead.rating ? { score: lead.rating.toFixed(1), count: lead.reviews, url: lead.mapsUrl?.split('&')[0] } : null,
      ...copy, gallery, areas: [lead.city.replace(/,\s*[A-Z]{2}$/, '')],
    };
    await writeFile(path.join(out, 'site.json'), JSON.stringify(data, null, 1));
    const html = renderSite(data);
    await writeFile(path.join(out, 'index.html'), html);

    // 6. Screenshots for the human check, and one self-contained file to open anywhere.
    for (const [name, viewport] of [['desktop', { width: 1280, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
      const p = await browser.newPage({ viewport });
      await p.goto(`file://${path.join(out, 'index.html')}`, { waitUntil: 'networkidle' });
      await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } scrollTo(0, 0); });
      await p.waitForTimeout(2500);
      await p.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 70, fullPage: true });
      await p.close();
    }
    const { readFile: rf } = await import('node:fs/promises');
    let inline = html;
    for (const m of [...new Set([...html.matchAll(/(?:src|data-full)="((?:img\/[^"]+)|logo\.png)"/g)].map((x) => x[1]))]) {
      const b64 = (await rf(path.join(out, m))).toString('base64');
      inline = inline.split(`"${m}"`).join(`"data:image/${m.endsWith('png') ? 'png' : 'jpeg'};base64,${b64}"`);
    }
    await writeFile(path.join(out, 'preview.html'), inline);

    // 7. The email, for approval.
    const link = `${config.previewBase}${slug}/`;
    const mail = draftEmail({ lead, link, sender: config.sender, used: { photos: gallery.length > 0 || heroIndex >= 0, reviews: copy.reviews.length > 0 } });
    if (!config.sender.address) checks.push('No postal address yet (config.json sender.address): required by law before sending.');
    if (!email) checks.push('No email address for this business.');
    await writeFile(path.join(out, 'email.txt'), `To: ${email}\nSubject: ${mail.subject}\n\n${mail.body}\n`);
    await writeFile(path.join(out, 'check.txt'), checks.length ? checks.map((c) => `- ${c}`).join('\n') + '\n' : 'Nothing flagged.\n');
    console.log(`\n→ demos/${slug}/  (preview.html, desktop.jpg, phone.jpg, email.txt, check.txt)`);
    for (const c of checks) console.log(`  ! ${c}`);
    await tool.close();
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
