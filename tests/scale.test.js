import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyLimit, plan } from '../pipeline/queue.mjs';
import { pick } from '../pipeline/batch.mjs';
import { gap, draftEmail } from '../pipeline/email.mjs';
import { unbackedClaim, verify } from '../pipeline/copy.mjs';

test('mailboxes ramp 5 then 10 a day, never before their start, never from neonsignsites.com', () => {
  const box = { address: 'alon@neonsignsites.net', start: '2026-12-01', ramp: [5, 10], max: 10 };
  assert.equal(dailyLimit(box, '2026-11-30'), 0);
  assert.equal(dailyLimit(box, '2026-12-01'), 5);
  assert.equal(dailyLimit(box, '2026-12-07'), 5);
  assert.equal(dailyLimit(box, '2026-12-08'), 10);
  assert.equal(dailyLimit(box, '2027-03-01'), 10);
  assert.equal(dailyLimit({ ...box, start: null }, '2026-12-08'), 0);
  assert.equal(dailyLimit({ ...box, address: 'alon@neonsignsites.com' }, '2026-12-08'), 0);
});

test('the daily plan: each business once, within each mailbox\'s room, skipping do-not-contact', () => {
  const ready = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s) => ({ slug: s, to: `${s}@${s}-lawns.com`, name: s }));
  const mailboxes = [{ address: 'alon@neonsignsites.net', start: '2026-12-01', ramp: [5] }];
  const sent = [{ slug: 'a', to: 'a@a-lawns.com', from: 'alon@neonsignsites.net', date: '2026-12-01' }, { slug: 'z', to: 'z@z-lawns.com', from: 'alon@neonsignsites.net', date: '2026-12-02' }];
  const dnc = [{ email: 'c@c-lawns.com' }];
  const { out, skipped } = plan({ ready, sent, mailboxes, dnc, day: '2026-12-02' });
  assert.deepEqual(out.map((o) => o.slug), ['b', 'd', 'e', 'f']); // 5 a day, 1 already sent today; a was emailed before; c said no
  assert.deepEqual(skipped, ['c: on the do-not-contact list']);
});

test('a batch takes weak sites first, trades in turn, and skips what cannot be built', () => {
  const L = (name, trade, kind, reviews, o = {}) => ({ placeId: name, name, city: 'Austin, TX', trade, kind, reviews, email: `${name}@x.com`, ...o });
  const leads = [
    L('l1', 'Lawn care', 'weak site', 50), L('l2', 'Lawn care', 'weak site', 90), L('d1', 'Mobile car detailing', 'weak site', 10),
    L('d2', 'Mobile car detailing', 'decent site', 300), L('s1', 'Lawn care', 'strong site', 999),
    L('n1', 'Lawn care', 'weak site', 999, { email: '' }), L('p1', 'Pressure washing', 'weak site', 999), L('b1', 'Lawn care', 'weak site', 999),
  ];
  assert.deepEqual(pick(leads, { count: 4, built: new Set(['b1']) }).map((l) => l.name), ['l2', 'd1', 'l1', 'd2']);
  assert.deepEqual(pick(leads, { count: 9, kinds: ['decent site'] }).map((l) => l.name), ['d2']);
});

test('decent sites get an email naming their gap', () => {
  assert.match(gap(['no meta description', 'no tap-to-call link']), /can't tap to call/);
  assert.equal(gap([]), null);
  const lead = { name: 'Dewey Lawns', rating: 4.9, reviews: 230, reasons: [], improvements: ['no reviews on the site'] };
  assert.match(draftEmail({ lead, link: 'l', sender: { name: 'A' } }).body, /230 Google reviews is great, but your website doesn't show any of your reviews\./);
});

test('trust claims and notes-to-self are dropped unless their site backs them', () => {
  const site = 'Family-owned since 2010. We do same-day service. The owner, Mike, does every job.';
  assert.equal(unbackedClaim('Family owned', site), null);
  assert.equal(unbackedClaim('Mike does the work himself', site), null);
  assert.match(unbackedClaim('Licensed & insured', site), /licensed/i);
  assert.match(unbackedClaim('No subcontractors, all in-house', site), /subcontract/i);
  assert.match(unbackedClaim('The site lists every day as open 24 hours.', site), /note about the site/);
  assert.equal(unbackedClaim('Debris hauled and the site left clean', site), null);
  const { copy, dropped } = verify({ why: [{ name: 'Insured', text: 'Fully insured crew' }, { name: 'Fast', text: 'Same-day service' }], steps: [], services: [], reviews: [] }, { text: site, facts: '' });
  assert.deepEqual(copy.why.map((w) => w.name), ['Fast']);
  assert.equal(dropped.length, 1);
});

test('borrowing trades get a kit and their own default wording, with no lawn or detailing leftovers', async () => {
  const { kitFor, tradeCopy, lawnCopy, detailingCopy } = await import('../pipeline/copy.mjs');
  const { renderSite } = await import('../generator/render.mjs');
  assert.equal(kitFor('Paintless dent repair'), 'detailing');
  assert.equal(kitFor('Christmas light installation'), 'holiday');
  assert.equal(kitFor('Handyman'), null);
  const lights = tradeCopy('Christmas light installation', lawnCopy({ name: 'Glow Co', city: 'Waco, TX', text: '' }), 'Waco, TX');
  assert.equal(lights.promise, null);
  assert.match(lights.kicker, /Christmas light installation · Waco/);
  const html = renderSite({ kit: 'holiday', name: 'Glow Co', phone: '1', email: 'a@b.com', gallery: [], areas: ['Waco'], ...lights });
  assert.doesNotMatch(html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/data:image[^"']*/g, ''), /mow|Yard size|Yards we take care/i); // CSS comments and the embedded photo aside
  const dent = tradeCopy('Paintless dent repair', detailingCopy({ name: 'Dent Pro', city: 'Waco, TX', text: '' }), 'Waco, TX');
  const html2 = renderSite({ kit: 'detailing', name: 'Dent Pro', phone: '1', email: 'a@b.com', gallery: [{ src: 'img/a.jpg', alt: 'a', size: 'big' }], areas: ['Waco'], ...dent });
  assert.doesNotMatch(html2, /pet hair|oxidized|Fresh off the driveway/i);
  assert.match(html2, /Dents gone, paint untouched/);
});

test('the photo pitch: no gallery, and the email asks for job photos instead of praising them', () => {
  const lead = { name: 'Glow Co', rating: 4.9, reviews: 113, reasons: ['GoDaddy site builder'] };
  const body = draftEmail({ lead, link: 'L', sender: { name: 'A' }, used: { photos: true, reviews: true }, pitch: 'photos' }).body;
  assert.match(body, /113 Google reviews is great, but your website shows almost none of your work\./);
  assert.match(body, /rebuilt it with your own services and reviews, and left room for your work/);
  assert.match(body, /Send me 5 or 6 photos of jobs you're proud of/);
  assert.match(body, /your first month is free, then \$49 a month/);
  assert.doesNotMatch(body, /your own photos/);
  const normal = draftEmail({ lead, link: 'L', sender: { name: 'A' } }).body;
  assert.doesNotMatch(normal, /Send me 5 or 6 photos/);
});

test('house painting and boat detailing: their own design or wording, no lawn or car leftovers', async () => {
  const { kitFor, tradeCopy, lawnCopy, detailingCopy } = await import('../pipeline/copy.mjs');
  const { renderSite } = await import('../generator/render.mjs');
  assert.equal(kitFor('House painting'), 'painting');
  assert.equal(kitFor('Paintless dent repair'), 'detailing');
  assert.equal(kitFor('Boat detailing'), 'detailing');
  const visible = (h) => h.replace(/<style[\s\S]*?<\/style>/g, '');
  const paint = tradeCopy('House painting', lawnCopy({ name: 'Brush Co', city: 'Lubbock, TX', text: '' }), 'Lubbock, TX');
  const html = renderSite({ kit: 'painting', name: 'Brush Co', phone: '1', email: 'a@b.com', gallery: [{ src: 'img/a.jpg', alt: 'a', size: 'big' }], areas: ['Lubbock'], ...paint });
  assert.doesNotMatch(visible(html), /mow|yard|lawn|grass/i);
  assert.match(html, /Homes we’ve painted/);
  assert.match(html, /theme-color" content="#1b2a3a"/);
  const boat = tradeCopy('Boat detailing', detailingCopy({ name: 'Hull Co', city: 'Sarasota, FL', text: '' }), 'Sarasota, FL');
  const html2 = renderSite({ kit: 'detailing', name: 'Hull Co', phone: '1', email: 'a@b.com', gallery: [{ src: 'img/a.jpg', alt: 'a', size: 'big' }], areas: ['Sarasota'], ...boat });
  assert.match(html2, /<option>Pontoon<\/option>/);
  assert.doesNotMatch(visible(html2), /Toyota|pet hair|SUV or truck/i);
});

test('the wording library keeps only general lines, and reuses them without carrying claims across', async () => {
  const { harvestOne, fromLibrary, generalize } = await import('../pipeline/wording.mjs');
  assert.equal(generalize('Call (512) 555-0100 today', { name: 'X', town: 'Austin' }), null);
  assert.equal(generalize('Why Austin calls Dewey Lawns', { name: 'Dewey Lawns', town: 'Austin' }), 'Why {town} calls {name}');
  assert.equal(generalize('Dewey handles every job', { name: 'Dewey Lawns', town: 'Austin' }), null);
  assert.equal(generalize("Why Ray's.", { name: 'Ray’s Painting & Pressure Washing Services', town: 'Jacksonville' }), null);
  const entry = harvestOne({ name: 'Dewey Lawns', areas: ['Austin'], headline: 'Your weekend back.', howTitle: 'Fully guaranteed in three steps.', whyTitle: 'Why Austin trusts Dewey Lawns',
    steps: [{ name: 'Book', text: 'Online in a minute.' }, { name: 'We mow', text: 'On your day.' }, { name: 'Relax', text: 'Done.' }] });
  assert.equal(entry.whyTitle, 'Why {town} trusts {name}');
  const out = fromLibrary({ headline: 'x', howTitle: 'default', steps: [] }, [entry], { name: 'Goat Lawns', town: 'Waco', text: 'We mow lawns in Waco.' });
  assert.equal(out.whyTitle, 'Why Waco trusts Goat Lawns');
  assert.equal(out.howTitle, 'default'); // "guaranteed" is not on Goat's site
  assert.equal(out.steps.length, 3);
});

test('the signature carries the phone and address, and old drafts get the current one', async () => {
  const { signature, refreshSignature } = await import('../pipeline/email.mjs');
  const sender = { name: 'Alon Katz', phone: '(888) 444-1847', address: '6421 N. Florida Ave, Suite D-1009, Tampa, FL 33604' };
  assert.equal(signature(sender), 'Rather talk it through? Call me at (888) 444-1847.\n\nAlon Katz\nNeon Sign Sites\n(888) 444-1847\n6421 N. Florida Ave, Suite D-1009, Tampa, FL 33604');
  const old = 'To: a@b.com\nSubject: S\n\nHi,\n\nBody.\n\nAlon Katz\nNeon Sign Sites\n[POSTAL ADDRESS: required before sending]\n\nNot interested? Reply "no" and I won\'t email you again.\n';
  const now = refreshSignature(old, sender);
  assert.ok(now.includes('Body.\n\nRather talk it through? Call me at (888) 444-1847.\n\nAlon Katz\nNeon Sign Sites\n(888) 444-1847\n6421 N.'));
  assert.equal(refreshSignature(now, sender), now); // refreshing twice changes nothing
  assert.ok(!now.includes('POSTAL ADDRESS'));
  assert.ok(now.endsWith('won\'t email you again.\n'));
});

test('daily ramp: 3 on the first day, +2 every day (weekends too), capped at max', async () => {
  const { dailyLimit } = await import('../pipeline/queue.mjs');
  const box = { address: 'alon@neonsignsites.net', start: '2026-11-27', daily: { first: 3, step: 2 }, max: 10 };
  assert.equal(dailyLimit(box, '2026-11-26'), 0);
  assert.equal(dailyLimit(box, '2026-11-27'), 3); // Friday
  assert.equal(dailyLimit(box, '2026-11-28'), 5); // Saturday
  assert.equal(dailyLimit(box, '2026-11-29'), 7); // Sunday
  assert.equal(dailyLimit(box, '2026-11-30'), 9);
  assert.equal(dailyLimit(box, '2026-12-01'), 10);
  assert.equal(dailyLimit(box, '2026-12-10'), 10);
});
