import test from 'node:test';
import assert from 'node:assert/strict';
import { galleryPlan, imageKey, photoCandidates, logoCandidate } from '../pipeline/photos.mjs';
import { kitFor, detailingCopy, verify } from '../pipeline/copy.mjs';
import { weakness, draftEmail } from '../pipeline/email.mjs';
import { renderSite } from '../generator/render.mjs';

test('gallery sizes leave no holes in 4 or 2 columns', () => {
  assert.deepEqual(galleryPlan(20), { count: 12, tall: true });
  assert.deepEqual(galleryPlan(10), { count: 9, tall: false });
  assert.deepEqual(galleryPlan(8), { count: 8, tall: true });
  assert.deepEqual(galleryPlan(3), { count: 0, tall: false });
  for (const n of [12, 9, 8, 5, 4]) {
    const { tall } = galleryPlan(n);
    const cells = n + 3 + (tall ? 1 : 0);
    assert.equal(cells % 4, 0, `${n} photos fill 4 columns`);
    assert.equal(cells % 2, 0, `${n} photos fill 2 columns`);
  }
});

test('the same photo at several sizes counts once, largest kept; icons and logos skipped', () => {
  assert.equal(imageKey('https://x.com/wp-content/uploads/2022/01/car-1024x768.jpg'), 'car.jpg');
  const list = photoCandidates([
    { src: 'https://x.com/car-300x225.jpg', w: 300, h: 225 },
    { src: 'https://x.com/car-1024x768.jpg', w: 1024, h: 768 },
    { src: 'https://x.com/car.jpg', w: 2048, h: 1536 },
    { src: 'https://x.com/logo.png', w: 1200, h: 800, logoHint: true },
    { src: 'https://x.com/user-icon.png', w: 1280, h: 1248 },
    { src: 'https://x.com/badge.svg', w: 900, h: 900 },
  ]);
  assert.deepEqual(list.map((i) => i.src), ['https://x.com/car.jpg']);
});

test('logo: the marked image in the header wins', () => {
  const logo = logoCandidate([
    { src: 'https://x.com/a-logo.png', w: 400, h: 200, logoHint: true, inHeader: false },
    { src: 'https://x.com/b-logo.png', w: 150, h: 100, logoHint: true, inHeader: true },
  ]);
  assert.equal(logo.src, 'https://x.com/b-logo.png');
});

test('kit by trade', () => {
  assert.equal(kitFor('Mobile car detailing'), 'detailing');
  assert.equal(kitFor('Lawn care'), 'lawn');
  assert.equal(kitFor('Plumber'), null);
});

test('kit wording follows what the site offers, and only says "mobile" when it is', () => {
  const mobile = detailingCopy({ name: 'Joe Mobile Detailing', city: 'Tampa, FL', text: 'Ceramic coating. Headlight restoration. Boat wash.' });
  assert.match(mobile.kicker, /^Mobile car detailing · Tampa, FL$/);
  assert.ok(mobile.services.some((s) => s.name === 'Ceramic coating'));
  assert.deepEqual(mobile.also, [{ name: 'Boats' }]);
  const shop = detailingCopy({ name: 'Joe Detail Shop', city: 'Tampa, FL', text: 'Paint correction and wax.' });
  assert.equal(shop.mobile, null);
  assert.ok(shop.services.length >= 3);
});

test('verify drops invented numbers and reviews not on the site', () => {
  const text = 'Erick did a great job on my F150! Looks like new again. Mon – Fri: 9:00 – 18:00';
  const { copy, dropped } = verify({
    intro: 'Over 15 years of experience.',
    services: [{ name: 'Ceramic coating', text: 'Lasts 7 years.' }, { name: 'Polish', text: 'Deep shine.' }],
    why: [], steps: [], hours: ['Mon – Fri: 9:00 – 18:00'],
    reviews: [{ text: 'Erick did a great job on my F150! … Looks like new again.', name: 'Alain' }, { text: 'Best ever.', name: 'Nobody' }],
  }, { text, facts: 'Google rating: 5 from 161 reviews' });
  assert.equal(copy.intro, null);
  assert.deepEqual(copy.services.map((s) => s.name), ['Polish']);
  assert.equal(copy.reviews.length, 1);
  assert.equal(copy.hours.length, 1);
  assert.equal(dropped.length, 3);
});

test('email: names the site problem, has the link, the price, an address and an opt-out', () => {
  assert.match(weakness(['slow (5.5s)']), /5\.5 seconds/);
  const { subject, body } = draftEmail({
    lead: { name: "Erick's Auto Detailing", rating: 5, reviews: 161, reasons: ['slow (5.5s)'] },
    link: 'https://neonsignsites.com/p/ericks-auto-detailing/',
    sender: { name: 'Alon Katz', address: null },
  });
  assert.equal(subject, "I rebuilt the Erick's Auto Detailing website");
  assert.match(body, /5\.0 stars from 161 Google reviews is great, but your website takes 5\.5 seconds/);
  assert.match(body, /https:\/\/neonsignsites\.com\/p\/ericks-auto-detailing\//);
  assert.match(body, /own it outright for \$299/);
  assert.match(body, /then \$49 a year/);
  assert.match(body, /minimum 2 paid months/);
  assert.match(body, /POSTAL ADDRESS/);
  assert.match(body, /Reply "no"/);
});

test('both kits render, and a preview is never indexed', () => {
  const base = { name: 'Test Co', preview: true, title: 't', description: 'd', phone: '(813) 555-0100', email: 'a@b.c', services: [{ name: 'S', text: 'T' }], steps: [{ name: 'A', text: 'B' }], areas: ['Tampa'], hours: [] };
  for (const kit of ['lawn', 'detailing']) {
    const html = renderSite({ ...base, kit, kicker: 'k', headline: 'h', intro: 'i', contactTitle: 'c', servicesTitle: 's', servicesIntro: 's', howTitle: 'h', areasTitle: 'a', areasIntro: 'a', promise: 'p', logo: 'l.png' });
    assert.match(html, /noindex, nofollow/);
    assert.match(html, /tel:\+18135550100/);
  }
  assert.throws(() => renderSite({ ...base, kit: 'plumbing' }), /Unknown kit/);
});

test('plain business names and two-line wordmarks', async () => {
  const { cleanName, splitWordmark } = await import('../pipeline/copy.mjs');
  assert.equal(cleanName('602 Mobile Car Detailing in Phoenix', 'Phoenix, AZ'), '602 Mobile Car Detailing');
  assert.equal(cleanName('Grunt Wash Mobile Detailing LLC', 'Houston, TX'), 'Grunt Wash Mobile Detailing');
  assert.equal(cleanName('Shine Co - Best Detailing in Tampa', 'Tampa, FL'), 'Shine Co');
  assert.equal(cleanName('Evergreen Outdoor Services, LLC', 'Houston, TX'), 'Evergreen Outdoor Services');
  assert.deepEqual(splitWordmark('Merion Landscape Services'), { top: 'Merion Landscape Services', bottom: '' });
  assert.deepEqual(splitWordmark('Central Lawn Care'), { top: 'Central', bottom: 'Lawn Care' });
  assert.deepEqual(splitWordmark("Erick's Auto Detailing"), { top: "Erick's", bottom: 'Auto Detailing' });
  assert.deepEqual(splitWordmark('602 Mobile Car Detailing'), { top: '602', bottom: 'Mobile Car Detailing' });
  assert.deepEqual(splitWordmark('Pure Power Detail'), { top: 'Pure Power', bottom: 'Detail' });
  assert.deepEqual(splitWordmark('Mobiluxe'), { top: 'Mobiluxe', bottom: '' });
});

test('hero: a bright landscape photo beats a dark one and any portrait', async () => {
  const { pickHero } = await import('../pipeline/photos.mjs');
  assert.equal(pickHero([{ w: 800, h: 1000, bright: 140 }, { w: 1200, h: 800, bright: 40 }, { w: 1200, h: 800, bright: 120 }]), 2);
  assert.equal(pickHero([{ w: 800, h: 1000, bright: 30 }, { w: 800, h: 1000, bright: 130 }]), 1);
  assert.equal(pickHero([]), -1);
});

test('email only promises the reviews when the preview has them', () => {
  const lead = { name: 'X', rating: 5, reviews: 30, reasons: [] };
  assert.match(draftEmail({ lead, link: 'l', sender: { name: 'A' }, used: { photos: true, reviews: false } }).body, /your own photos and services\./);
  assert.match(draftEmail({ lead, link: 'l', sender: { name: 'A' } }).body, /your own photos, services and reviews\./);
});

test('do-not-contact: matches by email, by company domain, by name; a shared gmail domain alone does not', async () => {
  const { blocked } = await import('../pipeline/dnc.mjs');
  const lead = { name: 'Evergreen Outdoor Services', email: 'admin@evergreenoutdoorservicestx.com', website: 'http://evergreenlawncaretx.com/' };
  assert.ok(blocked(lead, [{ email: 'Admin@EvergreenOutdoorServicesTX.com' }]));
  assert.ok(blocked(lead, [{ email: 'owner@evergreenoutdoorservicestx.com' }]), 'another address at their domain');
  assert.ok(blocked(lead, [{ domain: 'www.evergreenlawncaretx.com' }]));
  assert.ok(blocked(lead, [{ name: 'evergreen outdoor services' }]));
  assert.equal(blocked({ name: 'New Shine', email: 'newshinedetailingfl@gmail.com' }, [{ email: 'someone@gmail.com' }]), null);
  assert.equal(blocked(lead, []), null);
});

test('detailing menu links only to sections the page has', () => {
  const base = { kit: 'detailing', name: 'X', phone: '1', kicker: 'a · b', headline: 'h', intro: 'i', services: [], steps: [], areas: ['Tampa'] };
  assert.doesNotMatch(renderSite({ ...base, reviews: [], gallery: [] }), /href="#reviews"|href="#work"/);
  assert.match(renderSite({ ...base, reviews: [{ text: 't', name: 'n' }], gallery: [{ src: 'a.jpg', alt: '' }] }), /href="#reviews"[\s\S]*id="reviews"/);
});
