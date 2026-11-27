import test from 'node:test';
import assert from 'node:assert/strict';
import { googleReviewSignals, ownReviews, vehicleFocus, fixStepsTitle, townsInAlso, HEARSAY } from '../pipeline/checks.mjs';

const page = (o) => ({ url: 'https://x.com/', text: '', raw: '', rendered: '', ...o });

test('Google reviews on their site are spotted (widgets, labels, badges)', () => {
  assert.equal(googleReviewSignals([page({ rendered: '<div class="ti-widget">' })]).length, 1);
  assert.equal(googleReviewSignals([page({ rendered: '<script src="https://static.elfsight.com/platform.js">' })]).length, 1);
  assert.equal(googleReviewSignals([page({ text: 'Great job! Posted on Google' })]).length, 1);
  assert.equal(googleReviewSignals([page({ text: 'Mark — Google review. Janet — Google review.' })]).length, 1);
  assert.equal(googleReviewSignals([page({ raw: '<img src="/uploads/Google5stars1.png">' })]).length, 1);
  // A link to their listing is fine.
  assert.equal(googleReviewSignals([page({ text: 'Read our Google reviews. Leave us a Google review!' })]).length, 0);
});

test('only reviews written into their own HTML are kept', () => {
  const reviews = [
    { name: 'Ann', text: 'They came on time and the deck looks brand new, we will call again next year.' },
    { name: 'Bob', text: 'Excellent crew, fair price and the house looks amazing from the street now.' },
  ];
  const raw = '<p>&#8220;They came on time and the deck looks brand new, we will call again next year.&#8221;</p>';
  const r = ownReviews(reviews, [page({ raw })]);
  assert.deepEqual(r.reviews.map((x) => x.name), ['Ann']);
  assert.equal(r.dropped.length, 1);
  assert.equal(ownReviews(reviews, [page({ raw, rendered: '<div class="trustindex">' })]).reviews.length, 0);
  // No server HTML available: nothing to compare with, keep them.
  assert.equal(ownReviews(reviews, [page({})]).reviews.length, 2);
});

test('car detailers found by a boat search are told apart', () => {
  assert.equal(vehicleFocus('Car detailing for cars, trucks and SUVs. Your vehicle, our care. Auto spa.'), 'cars');
  assert.equal(vehicleFocus('Boat detailing: boats, yachts and pontoons. Gelcoat and hull care. One car.'), 'boats');
  assert.equal(vehicleFocus('Yacht and boat care, marine ceramic coating, and car and vehicle detailing for trucks and cars.'), 'both');
});

test('a steps title counts its steps', () => {
  assert.equal(fixStepsTitle('Lit up in four steps.', 3), 'Lit up in three steps.');
  assert.equal(fixStepsTitle('A fresh coat in four steps, shown as three.', 3), 'A fresh coat in three steps.');
  assert.equal(fixStepsTitle('From estimate to final walkthrough.', 3), 'From estimate to final walkthrough.');
});

test('towns are not extra services; review hearsay is recognised', () => {
  const also = [{ name: 'Waco' }, { name: 'Hewitt' }, { name: 'Commercial lighting' }];
  const towns = townsInAlso(also, { areas: ['Woodway'], text: 'Proudly serving Waco, Woodway, Hewitt and Robinson.' });
  assert.deepEqual(towns.map((t) => t.name), ['Waco', 'Hewitt']);
  assert.ok(HEARSAY.test('Customers say the crew shows up when promised.'));
  assert.ok(HEARSAY.test('A team that shows up on time, according to our customers.'));
  assert.ok(!HEARSAY.test('We show up on time.'));
});
