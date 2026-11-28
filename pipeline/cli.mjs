#!/usr/bin/env node
// One command from a lead to a draft site, screenshots and an email, ready for a human to approve:
//   npm run lead -- "Erick's Auto Detailing"     (a name, or part of one, from leads/)
//   npm run lead -- "..." --no-ai                 (ready-made kit wording only, free)
//   npm run lead -- --place <id> --prepare         (stop before the AI step: writes demos/<slug>/.build.json
//                                                   and .ai-request.json, for a Message Batch; see batch.mjs)
//   npm run lead -- --finish <slug>                (go on from there with demos/<slug>/.ai-result.json, or a
//                                                   direct call when there is none)
// Writes demos/<slug>/: site.json, index.html, img/, logo, desktop.jpg, phone.jpg,
// preview.html (one file with everything inside), email.txt and check.txt (what a human should look at).

import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// Playwright is installed globally in the cloud sessions; require() finds it from any folder.
const { chromium } = createRequire(import.meta.url)('playwright');
import { scrapeSite } from './scrape.mjs';
import { photoCandidates, logoCandidate, galleryPlan, saveImage, thumbnail, pickHero } from './photos.mjs';
import { kitFor, detailingCopy, lawnCopy, tradeCopy, sharpenRequest, parseSharpen, callClaude, anthropicKey, verify, cleanName, splitWordmark, FACT_FIELDS } from './copy.mjs';
import { ownReviews, HEARSAY, vehicleFocus, vehicleCounts, fixStepsTitle, townsInAlso } from './checks.mjs';
import { draftEmail } from './email.mjs';
import { blocked } from './dnc.mjs';
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
    for (const l of list) if (l?.placeId === query || l?.name?.toLowerCase().includes(query.toLowerCase())) found.push(l);
  }
  return found;
}

const BUILD_FILES = ['.build.json', '.ai-request.json', '.ai-result.json'];

async function main() {
  const finishSlug = arg('finish');
  const prepare = args.includes('--prepare');
  const query = arg('place') ?? arg('lead');
  if (!query && !finishSlug) { console.log('npm run lead -- --lead "<business name>" | --place <Google place ID> [--no-ai] [--fresh] [--prepare] | --finish <slug>'); process.exit(1); }
  const config = JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8'));
  let lead, kit, slug, out, checks, site, text, photos, logo, copy, heroIndex, order, alts, wordmark, existing, libFirst, model, lib;
  if (finishSlug) {
    const st = JSON.parse(await readFile(path.join(root, 'demos', finishSlug, '.build.json'), 'utf8'));
    ({ lead, kit, slug, checks, site, text, photos, logo, copy, heroIndex, order, alts, wordmark, existing, libFirst, model } = st);
    out = path.join(root, 'demos', slug);
  } else {
  // A place ID picks one exact listing; a name can match several (one business, many listings).
  const leads = (await findLead(query)).filter((l) => !arg('place') || l.placeId === query);
  if (!leads.length) throw new Error(`No lead matches "${query}" in leads/.`);
  // A request from the site's form wins over the same business found by a search (its email is theirs).
  lead = leads.find((l) => l.source === 'form') ?? leads.find((l) => l.website && l.email) ?? leads[0];
  if (leads.length > 1) console.log(`(${leads.length} matches; using ${lead.name})`);
  const dnc = JSON.parse(await readFile(path.join(root, 'do-not-contact.json'), 'utf8')).entries;
  const no = blocked(lead, dnc);
  if (no) throw new Error(`${lead.name} is on the do-not-contact list (${no.email ?? no.domain ?? no.name}, ${no.date ?? 'no date'}). Not building it.`);
  kit = kitFor(lead.trade);
  if (!kit) throw new Error(`No kit for "${lead.trade}" yet (detailing and lawn care only).`);
  if (!lead.website || /instagram|facebook/.test(lead.website)) throw new Error('This lead has no website to rebuild from.');

  // People call the business by its plain name, not Google's keyword-stuffed one.
  lead.listedName = lead.name;
  lead.name = cleanName(lead.name, lead.city);
  slug = slugify(lead.name);
  out = path.join(root, 'demos', slug);
  await mkdir(path.join(out, 'img'), { recursive: true });
  checks = [];
  // Google returns businesses from around the searched city (hail-repair shops travel far): the
  // site names the town in their own address.
  const own = lead.address?.match(/,\s*([^,]+),\s*([A-Z]{2})\s+\d{5}/);
  if (own && `${own[1].trim()}, ${own[2]}` !== lead.city) {
    checks.push(`Found by a search in ${lead.city}, but their address is in ${own[1].trim()}, ${own[2]}: the site uses that. Check their service area.`);
    lead.city = `${own[1].trim()}, ${own[2]}`;
  }
  }
  const browser = await chromium.launch();
  try {
    const tool = await browser.newPage();
    if (!finishSlug) {
    // 1. Their site.
    console.log(`Reading ${lead.website}`);
    site = await scrapeSite(browser, lead.website);
    if (!site) throw new Error('Their site did not load.');
    text = site.pages.map((p) => p.text).join('\n\n');
    // An error page ("upstream request failed", a bare 502) is not their site: no preview from it.
    if (text.trim().length < 150 || /^(upstream (request|connect) (failed|error)|bad gateway|service unavailable)/im.test(text.trim().slice(0, 200))) throw new Error('Their site did not load (error page).');
    // A boat search finds car detailers too: their preview gets car wording and a car form.
    if (kit === 'detailing' && /boat/i.test(lead.trade) && vehicleFocus(text) === 'cars') {
      checks.push(`Listed as ${lead.trade}, but their site is about cars: built as mobile car detailing.`);
      lead.trade = 'Mobile car detailing';
    } else if (kit === 'detailing' && /boat/i.test(lead.trade) && vehicleFocus(text) === 'both') {
      // Mostly cars: a neutral label, so the kicker, title and footer don't say "Boat detailing".
      if (vehicleCounts(text).cars >= vehicleCounts(text).boats) lead.trade = 'Mobile detailing';
      // Cars and boats (often more cars): the preview shows the work they do, not only the boats.
      lead.note = 'We found them by searching for boat detailing, but they detail cars and other vehicles too. Show the work they actually do: their real photos of any vehicle are good gallery and hero photos, and their car services belong in the services.';
      checks.push('Details cars and boats (found by a boat search): the AI was told to show all their work.');
    }

    if (lead.emailNote) checks.push(`Email ${lead.email}: ${lead.emailNote}.`);

    // 2. Photos and logo.
    photos = [];
    for (const c of photoCandidates(site.imgs).slice(0, 24)) {
      const file = path.join(out, 'img', `photo-${photos.length + 1}.jpg`);
      const saved = await saveImage(tool, c.src, file);
      // Small files (icons, textures behind a big box) are dropped once their real size is known.
      // The saved copy must decode again for the AI's thumbnail, or one bad image stops the build.
      if (saved && Math.max(saved.w, saved.h) >= 600 && Math.min(saved.w, saved.h) >= 380 && await thumbnail(tool, file).then(() => true, () => false)) photos.push({ file, rel: `img/photo-${photos.length + 1}.jpg`, ...saved, alt: c.alt });
    }
    console.log(`${photos.length} photos`);
    logo = null;
    const lc = logoCandidate(site.imgs);
    if (lc) logo = await saveImage(tool, lc.src, path.join(out, 'logo.png'), { max: 360, logo: true });
    if (!logo) checks.push('No logo found: the header shows the name only.');
    else if (logo.dark && logo.transparent) checks.push('Logo is dark on a transparent background: shown on a white chip. Check it reads well.');

    // 3. Words: the kit's, then sharper ones from Claude when available.
    copy = tradeCopy(lead.trade, (kit === 'detailing' ? detailingCopy : lawnCopy)({ name: lead.name, city: lead.city, text }), lead.city);
    // Proven general wording from reviewed previews of the same trade (wording/), over the defaults:
    // the AI improves on it, and --no-ai uses it as is. Facts still come only from their own site.
    const { library, fromLibrary } = await import('./wording.mjs');
    lib = await library(lead.trade);
    // Enough reviewed previews of this trade: the general wording comes from them as is, and the AI
    // is asked only for this business's facts and photos (cheaper, and already-reviewed wording).
    libFirst = lib.length >= (config.wording?.libraryFirstMin ?? 8);
    model = arg('model') ?? config.aiModel;
    if (lib.length) copy = fromLibrary(copy, lib, { name: lead.name, town: lead.city.replace(/,\s*[A-Z]{2}$/, ''), text });
    // A preview already polished by hand keeps its wording (--fresh starts over); only the photos,
    // logo and rating are refreshed.
    const existingFile = path.join(out, 'site.json');
    existing = !args.includes('--fresh') ? await readFile(existingFile, 'utf8').then(JSON.parse).catch(() => null) : null;
    const WORDS = ['kicker', 'headline', 'intro', 'badges', 'highlights', 'mobile', 'servicesTitle', 'servicesIntro', 'services', 'also', 'alsoTitle', 'promise', 'why', 'whyTitle', 'howTitle', 'steps', 'contactTitle', 'footerLine', 'reviews', 'hours', 'areas', 'areasTitle', 'areasIntro', 'title', 'description', 'wordmark', 'address', 'legalName'];
    if (existing) { for (const k of WORDS) if (existing[k] !== undefined) copy[k] = existing[k]; checks.push('Kept the hand-written wording from the existing site.json (use --fresh to start over).'); }
    // The hero prefers a landscape photo; phone photos (all portrait) still work, cropped.
    heroIndex = pickHero(photos);
    if (heroIndex >= 0 && photos[heroIndex].h >= photos[heroIndex].w) checks.push('Hero uses a portrait photo, cropped: check it looks good.');
    order = photos.map((_, i) => i).filter((i) => i !== heroIndex);
    alts = {};
    wordmark = splitWordmark(lead.name);
    }
    const useAi = !args.includes('--no-ai');
    if (useAi && !anthropicKey()) checks.push('No ANTHROPIC_API_KEY (or NEON_ANTHROPIC_API_KEY): used the kit wording (no reviews, generic intro).');
    let viaBatch = false;
    if (useAi && anthropicKey() && !existing) {
      let ai = null;
      if (finishSlug) {
        // The batch's answer, or (it failed or expired) one direct call with the same request.
        const req = JSON.parse(await readFile(path.join(out, '.ai-request.json'), 'utf8'));
        const res = await readFile(path.join(out, '.ai-result.json'), 'utf8').then(JSON.parse).catch(() => null);
        if (!res) console.log(`No batch answer: asking Claude (${model}) directly`);
        try { ai = { ...parseSharpen(res ?? await callClaude(req.params)), facts: req.facts }; viaBatch = !!res; }
        catch (e) { checks.push(`Claude failed (${e.message}): used the kit wording.`); }
      } else {
        const thumbs = [];
        for (const p of photos) thumbs.push(await thumbnail(tool, p.file));
        const logoThumb = logo ? await thumbnail(tool, path.join(out, 'logo.png')).catch(() => null) : null;
        const req = sharpenRequest({ kit, lead, text, draft: copy, thumbs, logoThumb, model, only: libFirst ? FACT_FIELDS : null });
        if (prepare) {
          // Stop here: batch.mjs sends the request with the others and runs --finish when it is answered.
          const st = { lead, kit, slug, checks, site: { pages: site.pages, emails: site.emails }, text, photos, logo, copy, heroIndex, order, alts, wordmark, existing, libFirst, model };
          await writeFile(path.join(out, '.build.json'), JSON.stringify(st));
          await writeFile(path.join(out, '.ai-request.json'), JSON.stringify(req));
          console.log(`→ prepared demos/${slug}/`);
          await tool.close();
          return;
        }
        console.log(libFirst ? `Asking Claude (${model}) for their facts and the photo choice; wording from the library (${lib.length} previews)` : `Asking Claude (${model}) for sharper wording and the photo choice`);
        try { ai = { ...parseSharpen(await callClaude(req.params)), facts: req.facts }; }
        catch (e) { checks.push(`Claude failed (${e.message}): used the kit wording.`); }
      }
      if (ai) {
      const r = ai.result;
      // Library-first: the general fields aren't in the answer, so the library's stay.
      const pick = (k) => (r[k] !== undefined ? r[k] : copy[k]);
      const section = copy.mobile ?? copy.highlights ?? {};
      const points = r.mobilePoints.length ? { title: r.mobileTitle ?? section.title, intro: r.mobileIntro ?? section.intro, points: r.mobilePoints } : null;
      const merged = {
        ...copy,
        kicker: pick('kicker'), headline: pick('headline'), intro: r.intro,
        ...(kit === 'detailing' ? { mobile: points } : { highlights: points }),
        servicesTitle: pick('servicesTitle'), servicesIntro: pick('servicesIntro'),
        services: r.services.map((s) => ({ name: s.name, text: s.text, ...(s.price ? { price: s.price } : {}) })),
        also: r.also.map((n) => ({ name: n })),
        whyTitle: pick('whyTitle'), why: r.why, howTitle: pick('howTitle'), steps: pick('steps'),
        contactTitle: pick('contactTitle'), footerLine: pick('footerLine'), hours: r.hours, reviews: r.reviews,
      };
      const { copy: checked, dropped } = verify(merged, { text, facts: ai.facts });
      // A section Claude left empty on purpose (no mobile points: they don't come to you) stays out;
      // other empty fields fall back to the kit wording.
      for (const k of Object.keys(checked)) if (checked[k] === null && !(['mobile', 'highlights'].includes(k) && !points)) checked[k] = copy[k];
      if (checked.steps.length < 3) checked.steps = copy.steps;
      if (checked.services.length < 3) checked.services = copy.services;
      if (checked.highlights) checked.highlights.points = checked.highlights.points.filter((p) => verify({ steps: [p] }, { text, facts: ai.facts }).copy.steps.length);
      copy = checked;
      for (const d of dropped) checks.push(`Dropped (not backed by their site): ${d}`);
      if (r.heroPhoto >= 1 && r.heroPhoto <= photos.length) heroIndex = r.heroPhoto - 1;
      // 0 means none of their photos is fit for the hero (logos, graphics): no hero photo then.
      else if (r.heroPhoto === 0) { heroIndex = -1; checks.push('No hero photo: Claude found none of their photos usable.'); }
      const picked = r.galleryPhotos.map((n) => n - 1).filter((i) => i >= 0 && i < photos.length && i !== heroIndex);
      if (picked.length >= 4) order = [...new Set(picked)];
      // Fewer than 4 usable photos: no gallery, rather than filling it with logos and graphics.
      else { order = []; checks.push(`Photo pitch: only ${picked.length} usable photo${picked.length === 1 ? '' : 's'} by Claude's choice, so no gallery; the email asks them for photos of their work.`); }
      alts = Object.fromEntries(r.photoAlts.map((a) => [a.photo - 1, a.alt]));
      wordmark = { top: r.wordmarkTop || lead.name, bottom: r.wordmarkBottom };
      // Logos found on their site are sometimes a Google badge, a client's or their web designer's.
      if (logo && r.logoIsTheirs === false) {
        logo = null;
        await import('node:fs/promises').then((fs) => fs.rm(path.join(out, 'logo.png'), { force: true }));
        checks.push('Logo dropped: Claude saw it is not theirs (a badge, a client\'s or their web designer\'s). The header shows the name only.');
      }
      if (r.notes) checks.push(`Claude's notes: ${r.notes}`);
      // Not their trade, or a franchise: no preview, and no batch builds it again.
      if (r.fit && r.fit !== 'yes') {
        const reason = r.fit === 'franchise' ? 'franchise location (Claude)' : `does not do ${lead.trade} itself (Claude): ${String(r.notes ?? '').slice(0, 160)}`;
        const fs = await import('node:fs/promises');
        const file = path.join(root, 'leads', 'rejected.json');
        const rej = JSON.parse(await fs.readFile(file, 'utf8').catch(() => '[]'));
        rej.push({ placeId: lead.placeId, name: lead.name, slug, reason, date: new Date().toISOString().slice(0, 10), auto: true });
        await fs.writeFile(file, JSON.stringify(rej, null, 1) + '\n');
        await fs.rm(out, { recursive: true, force: true });
        console.log(`✗ Not built: ${lead.name}, ${reason}. Added to leads/rejected.json.`);
        return;
      }
      const u = ai.usage;
      // A Message Batch costs half (Sonnet 5.5: $2 in / $10 out per million tokens, $1 / $5 in a batch).
      const price = (model.startsWith('claude-haiku') ? [0.10, 0.50] : [2, 10]).map((p) => (viaBatch ? p / 2 : p));
      const cents = (u.input_tokens * price[0] + u.output_tokens * price[1]) / 1e4;
      console.log(`Claude${viaBatch ? ' (batch)' : ''}: ${u.input_tokens} in, ${u.output_tokens} out (about ${cents.toFixed(2)} cents)`);
      }
    }

    // Checks that need no AI (pipeline/checks.mjs): reviews only when written into their own pages,
    // never Google's through a widget; no lines that quote reviews once those are gone; a steps title
    // that counts right; no towns among the extra services.
    if (!existing) {
      const own = ownReviews(copy.reviews ?? [], site.pages);
      for (const d of own.dropped) checks.push(`Dropped ${d}.`);
      copy.reviews = own.reviews;
      if (!copy.reviews.length) {
        const plain = (list) => (list ?? []).filter((p) => !HEARSAY.test(`${p.name} ${p.text}`));
        copy.why = plain(copy.why);
        for (const k of ['mobile', 'highlights']) if (copy[k]?.points) copy[k].points = plain(copy[k].points);
      }
      copy.howTitle = fixStepsTitle(copy.howTitle, copy.steps?.length);
      const towns = townsInAlso(copy.also ?? [], { areas: [lead.city.replace(/,\s*[A-Z]{2}$/, '')], text });
      if (towns.length) {
        copy.also = copy.also.filter((a) => !towns.includes(a));
        copy.areas = [...new Set([lead.city.replace(/,\s*[A-Z]{2}$/, ''), ...towns.map((t) => t.name ?? t)])];
      }
    }

    // 4. Gallery with no holes; the tall slot goes to a portrait photo when there is one.
    const plan = galleryPlan(order.length);
    let gallery = order.slice(0, plan.count).map((i) => ({ src: photos[i].rel, alt: alts[i] || photos[i].alt || `${{ lawn: 'Yard work', detailing: 'Detailing work', painting: 'Painting work', holiday: 'Holiday lights' }[kit] ?? 'Work'} by ${lead.name}` }));
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
      ...(existing ?? {}),
      kit, trade: lead.trade, name: existing?.name ?? lead.name, legalName: copy.legalName ?? lead.name, preview: true, placeId: lead.placeId,
      title: copy.title ?? `${lead.name} | ${copy.kicker.split(' · ')[0]} in ${lead.city}`,
      description: copy.description ?? `${copy.intro} ${lead.rating ? `${lead.rating.toFixed(1)} on Google from ${lead.reviews} reviews.` : ''}`.trim(),
      ...(kit === 'detailing' ? { brand: '#1670ff', brandHi: '#52c6ff', accent: '#8fd0ff' } : {}),
      logo: logo ? 'logo.png' : (existing?.logo ?? null), logoChip: logo ? !!(!logo.transparent || logo.dark) : !!existing?.logoChip, wordmark: copy.wordmark ?? wordmark,
      phone: lead.phone, email,
      heroImage: heroIndex >= 0 ? photos[heroIndex].rel : null,
      heroAlt: heroIndex >= 0 ? (alts[heroIndex] ?? '') : '',
      heroPosition: '60% 60%', heroPositionPhone: '60% 50%',
      rating: lead.rating ? { score: lead.rating.toFixed(1), count: lead.reviews, url: lead.mapsUrl?.split('&')[0] } : null,
      ...copy, gallery, areas: copy.areas ?? [lead.city.replace(/,\s*[A-Z]{2}$/, '')],
      // What the site check measured on their current site: the preview's "What this page fixes" box.
      ...(lead.reasons || lead.improvements ? { siteCheck: { reasons: lead.reasons ?? [], improvements: lead.improvements ?? [] } } : {}),
      pitch: gallery.length ? 'site' : 'photos', // photos: no gallery, the email asks for job photos
    };
    if (kit !== 'holiday' && !data.heroImage) checks.push('Hero is a licensed stock photo for the trade (credited on the page, see generator/assets/CREDITS.md), not their work: swap in their own photo once they send one.');
    if (kit === 'holiday' && !data.heroImage) checks.push('Hero is the holiday kit\'s licensed stock photo of lit trees (credited on the page), not their work: say so if they ask, and swap in their own photo once they send one.');
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
    // RULE: the first screen reads as a whole page (headline, buttons, Google rating) on every screen size.
    const { foldProblems } = await import('./fold.mjs');
    for (const f of await foldProblems(browser, path.join(out, 'index.html'))) checks.push(`First screen: ${f}. Fix before sending.`);
    const { readFile: rf } = await import('node:fs/promises');
    let inline = html;
    for (const m of [...new Set([...html.matchAll(/(?:src|data-full)="((?:img\/[^"]+)|logo\.png)"/g)].map((x) => x[1]))]) {
      const b64 = (await rf(path.join(out, m))).toString('base64');
      inline = inline.split(`"${m}"`).join(`"data:image/${m.endsWith('png') ? 'png' : 'jpeg'};base64,${b64}"`);
    }
    await writeFile(path.join(out, 'preview.html'), inline);

    // 7. The email, for approval.
    const link = `${config.previewBase}${slug}/`;
    const mail = draftEmail({ lead, link, sender: config.sender, used: { photos: gallery.length > 0 || heroIndex >= 0, reviews: copy.reviews.length > 0 }, pitch: gallery.length ? 'site' : 'photos' });
    if (!config.sender.address) checks.push('No postal address yet (config.json sender.address): required by law before sending.');
    if (!email) checks.push('No email address for this business.');
    await writeFile(path.join(out, 'email.txt'), `To: ${email}\nSubject: ${mail.subject}\n\n${mail.body}\n`);
    await writeFile(path.join(out, 'check.txt'), checks.length ? checks.map((c) => `- ${c}`).join('\n') + '\n' : 'Nothing flagged.\n');
    if (finishSlug) for (const f of BUILD_FILES) await rm(path.join(out, f), { force: true });
    console.log(`\n→ demos/${slug}/  (preview.html, desktop.jpg, phone.jpg, email.txt, check.txt)`);
    for (const c of checks) console.log(`  ! ${c}`);
    await tool.close();
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(process.env.DEBUG ? e.stack : e.message); process.exit(1); });
}
