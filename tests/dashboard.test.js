import test from 'node:test';
import assert from 'node:assert/strict';
import { pipeline } from '../dashboard.mjs';

test('dashboard: a form beats a reply beats a no beats a bounce; the rest are cold', () => {
  const sent = ['a', 'b', 'c', 'd', 'e'].map((s) => ({ slug: s, to: `${s}@x.com`, from: 'alon@neonsignsites.net', date: '2026-11-27' }));
  const replies = [
    { slug: 'a', kind: 'reply', date: '1' }, { slug: 'a', kind: 'site-form', date: '2' },
    { slug: 'b', kind: 'reply', date: '1' }, { slug: 'c', kind: 'no', date: '1' }, { slug: 'd', kind: 'bounce', date: '1' },
  ];
  const st = Object.fromEntries(pipeline({ sent, replies, dnc: [] }).map((r) => [r.slug, r.status]));
  assert.deepEqual(st, { a: 'hot-form', b: 'hot-reply', c: 'no', d: 'bounced', e: 'cold' });
});

test('events: preview opens and the Make it live page count, bots and our own HEAD checks do not', async () => {
  const { eventOf } = await import('../events.js');
  const req = (path, ua = 'Mozilla/5.0 (iPhone)', method = 'GET') => [{ method, headers: new Map([['user-agent', ua]]) }, new URL('https://neonsignsites.com' + path)];
  assert.deepEqual(eventOf(...req('/p/dewey-lawns/')), { kind: 'p', slug: 'dewey-lawns' });
  assert.deepEqual(eventOf(...req('/go?plan=monthly&site=dewey-lawns')), { kind: 'g', slug: 'dewey-lawns' });
  assert.equal(eventOf(...req('/p/dewey-lawns/img/photo-1.jpg')), null);
  assert.equal(eventOf(...req('/p/dewey-lawns/', 'Mozilla/5.0 (compatible; Googlebot/2.1)')), null);
  assert.equal(eventOf(...req('/p/dewey-lawns/', 'Mozilla/5.0', 'HEAD')), null);
});
