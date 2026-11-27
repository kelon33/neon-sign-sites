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
