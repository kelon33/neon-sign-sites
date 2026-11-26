import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_MASK, skipReason, worthNextPage, pickEmail, weaknesses, toLead, cost } from '../pipeline/find.mjs';

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
