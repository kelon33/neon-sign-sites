import test from 'node:test';
import { kitFor } from '../pipeline/copy.mjs';
import assert from 'node:assert/strict';
import { FIELD_MASK, skipReason, worthNextPage, pickEmail, weaknesses, toLead, cost, networkLooksBlocked, multiLocation, onePerWebsite, improvements, siteKind, TRADES } from '../pipeline/find.mjs';

const place = (o = {}) => ({ id: 'p1', displayName: { text: 'Joe’s Lawn Care' }, websiteUri: 'https://joeslawn.com/', userRatingCount: 40, businessStatus: 'OPERATIONAL', ...o });

test('the field mask stays in one price tier: no reviews, photos, hours or summaries', () => {
  for (const dear of ['reviews', 'photos', 'regularOpeningHours', 'currentOpeningHours', 'editorialSummary', 'generativeSummary', 'priceLevel'])
    assert.ok(!FIELD_MASK.includes(dear), `${dear} would raise the price of every request`);
  for (const needed of ['places.id', 'places.websiteUri', 'places.rating', 'places.userRatingCount', 'places.nationalPhoneNumber', 'nextPageToken'])
    assert.ok(FIELD_MASK.includes(needed));
});

test('chains, social pages, closed and tiny businesses are left out', () => {
  assert.equal(skipReason(place()), null);
  assert.equal(skipReason(place({ displayName: { text: 'Lawn Doctor of West Houston' } })), 'chain');
  assert.equal(skipReason(place({ displayName: { text: 'U.S. Lawns - Tampa' } })), 'chain');
  assert.equal(skipReason(place({ websiteUri: 'https://www.lawndoctor.com/westhouston-tx/' })), 'chain');
  assert.equal(skipReason(place({ websiteUri: 'https://www.facebook.com/joeslawn' })), 'social or booking page only');
  assert.equal(skipReason(place({ websiteUri: 'https://heygoldie.com/joe' })), 'chain');
  assert.equal(skipReason(place({ websiteUri: undefined })), 'no website');
  assert.equal(skipReason(place({ businessStatus: 'CLOSED_PERMANENTLY' })), 'closed');
  assert.equal(skipReason(place({ userRatingCount: 3 })), 'under 10 reviews');
  assert.equal(skipReason(place(), { known: new Set(['p1']) }), 'already in leads/');
});

test('the next page is only paid for while the last one was useful', () => {
  const good = Array.from({ length: 20 }, (_, i) => place({ id: `g${i}` }));
  const poor = Array.from({ length: 20 }, (_, i) => place({ id: `c${i}`, displayName: { text: i < 18 ? 'TruGreen' : 'Joe' } }));
  assert.equal(worthNextPage(good), true);
  assert.equal(worthNextPage(poor), false);
});

test('email: their own domain first, then a free mailbox, never a builder placeholder', () => {
  const site = 'https://www.joeslawn.com/';
  assert.equal(pickEmail('<a href="mailto:joe@gmail.com">x</a> office@joeslawn.com', site).email, 'office@joeslawn.com');
  assert.equal(pickEmail('write to joe@gmail.com', site).email, 'joe@gmail.com');
  assert.equal(pickEmail('filler@godaddy.com support@webador.com logo@2x.png', site).email, '');
  const other = pickEmail('hola@dominantsite.com', site);
  assert.equal(other.email, 'hola@dominantsite.com');
  assert.match(other.emailNote, /differs/);
  // A shorter domain inside theirs is not their own.
  assert.ok(pickEmail('a@detail.com', 'https://cleanmobiledetail.com/').emailNote);
});

test('site weaknesses match the older lead files', () => {
  const empty = weaknesses('<html><body>Hi</body></html>', { url: 'http://joe.wixsite.com/lawn', ms: 6000, year: 2026 });
  assert.deepEqual(empty, ['slow (6.0s)', 'no https', 'not mobile-friendly', 'almost empty', 'no domain of its own']);
  const fine = `<meta name="viewport" content="width=device-width"><p>${'Lawn care and mowing in Tampa. '.repeat(30)} © 2025</p>`;
  assert.deepEqual(weaknesses(fine, { url: 'https://joeslawn.com/', ms: 900, year: 2026 }), []);
  assert.deepEqual(weaknesses(fine.replace('2025', '2019'), { url: 'https://joeslawn.com/', ms: 900, year: 2026 }), ['copyright 2019']);
});

test('leads keep the shape npm run lead reads, and costs are list price per 1,000', () => {
  const l = toLead({ ...place(), rating: 4.9, nationalPhoneNumber: '(813) 555-0100', formattedAddress: 'Tampa, FL', googleMapsUri: 'https://maps.google.com/?cid=1' }, 'Lawn care', 'Tampa, FL');
  assert.deepEqual(Object.keys(l), ['placeId', 'name', 'website', 'address', 'phone', 'rating', 'reviews', 'mapsUrl', 'trade', 'city']);
  assert.equal(cost(600, 35), 21);
  assert.equal(cost(3, 35), 0.105);
});

test('a blocked network is not mistaken for broken sites', () => {
  const lead = (kind) => ({ kind });
  assert.equal(networkLooksBlocked([lead('site broken'), lead('site broken'), lead('site broken')]), true);
  assert.equal(networkLooksBlocked([...Array(8)].map(() => lead('site broken')).concat(lead('decent site'))), true);
  // About 1 in 10 broken is normal.
  assert.equal(networkLooksBlocked([...Array(9)].map(() => lead('decent site')).concat(lead('site broken'))), false);
  assert.equal(networkLooksBlocked([lead('site broken')]), false);
});

test('branch pages of multi-location companies are left out', () => {
  assert.equal(multiLocation('https://emeraldlawns.com/locations/round-rock-tx/?utm_source=google'), true);
  assert.equal(multiLocation('https://cleanairlawncare.com/service-locations/tx/austin/'), true);
  assert.equal(multiLocation('https://justrightlawns.com/austin-tx/lawn-care-austin'), true);
  assert.equal(multiLocation('https://ontimemobilecardetailingatx.com/south-congress'), false);
  assert.equal(multiLocation('https://deweylawns.com/'), false);
  assert.equal(skipReason(place({ websiteUri: 'https://joeslawn.com/locations/round-rock-tx/' })), 'multi-location company');
});

test('a business with a listing per neighbourhood becomes one lead (the most reviewed)', () => {
  const leads = [
    { placeId: 'a', website: 'https://pinksdetailingatx.com/?utm_campaign=gbp-north-austin', reviews: 105 },
    { placeId: 'b', website: 'https://pinksdetailingatx.com/southaustin', reviews: 48 },
    { placeId: 'c', website: 'https://www.topchoiceaustin.com/', reviews: 137 },
    { placeId: 'd', website: 'http://www.topchoiceaustin.com/', reviews: 644 },
    { placeId: 'e', website: 'https://deweylawns.com/', reviews: 230 },
  ];
  assert.deepEqual(onePerWebsite(leads).map((l) => l.placeId), ['a', 'd', 'e']);
});

test('working sites with clear gaps are a separate "decent site" category; no gaps is "strong"', () => {
  const bare = `<meta name="viewport" content="width=device-width"><p>${'We mow lawns in Austin. '.repeat(30)} © 2026</p>`;
  assert.deepEqual(improvements(bare, { ms: 900, year: 2026 }), ['no tap-to-call link', 'no quote or booking form', 'no reviews on the site', 'no photos', 'no meta description']);
  const full = `<meta name="description" content="x"><a href="tel:5125550100">Call</a><form></form><h2>What our customers say</h2>${'<img src="job.jpg">'.repeat(4)} © 2026`;
  assert.deepEqual(improvements(full, { ms: 900, year: 2026 }), []);
  assert.deepEqual(improvements(full.replace('2026', '2025'), { ms: 3000, year: 2026 }), ['loads in 3.0s', 'copyright 2025']);
  assert.equal(siteKind(['copyright 2016'], []), 'weak site');
  assert.equal(siteKind([], ['no tap-to-call link']), 'decent site');
  assert.equal(siteKind([], []), 'strong site');
});

test('each trade has its main phrase first, and every phrase fits a site kit', () => {
  assert.equal(TRADES.lawn.queries[0], 'lawn care service');
  assert.equal(TRADES.detailing.queries[0], 'mobile car detailing');
  for (const t of Object.values(TRADES).filter((t) => !t.test)) assert.ok(t.queries.length >= 3);
  // Test trades have no kit, so no previews are built for them.
  for (const t of Object.values(TRADES).filter((t) => t.test)) assert.equal(kitFor(t.trade), null);
});

test('lead files are sorted weak, decent, strong, and the readable copy has one section per category', async () => {
  const { sortLeads, leadsReport } = await import('../pipeline/find.mjs');
  const l = (name, kind, o = {}) => ({ name, kind, trade: 'Pool cleaning', city: 'Austin, TX', reviews: 20, email: 'a@b.com', website: `https://${name}.com/`, ...o });
  const leads = [l('s', 'strong site'), l('n', 'not checked', { email: undefined }), l('b', 'site broken'), l('d', 'decent site', { improvements: ['no quote form'] }),
    l('w2', 'weak site', { email: '' }), l('w1', 'weak site', { reasons: ['slow'] }), l('w3', 'weak site', { trade: 'Lawn care' })];
  assert.deepEqual(sortLeads(leads).map((x) => x.name), ['w3', 'w1', 'w2', 'd', 's', 'b', 'n']);
  assert.equal(leads[0].name, 's', 'the input is not changed');
  const md = leadsReport(leads, 'found-test');
  const at = (h) => md.indexOf(h);
  assert.ok(at('## Weak sites') > 0 && at('## Weak sites') < at('## Decent sites') && at('## Decent sites') < at('## Strong sites'));
  assert.match(md, /\| Pool cleaning \| 2 \| 1 \| 1 \| 1 \| 1 \| 6 \|/);
  assert.match(md, /\*\*w1\*\*.*slow/);
});
