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

test('Quo webhook signature: right key passes, wrong key or old timestamp fails', async () => {
  const { quoSignatureOk } = await import('../hooks.js');
  const { createHmac } = await import('node:crypto');
  const secret = Buffer.from('test-signing-key-1234').toString('base64');
  const body = '{"type":"call.completed"}';
  const sign = (ts, key = secret) => `hmac;1;${ts};${createHmac('sha256', Buffer.from(key, 'base64')).update(`${ts}.${body}`).digest('base64')}`;
  const now = Date.now();
  assert.equal(await quoSignatureOk(sign(now), body, secret), true);
  assert.equal(await quoSignatureOk(sign(now, Buffer.from('other').toString('base64')), body, secret), false);
  assert.equal(await quoSignatureOk(sign(now - 60 * 60 * 1000), body, secret), false);
  assert.equal(await quoSignatureOk(null, body, secret), false);
});

test('Quo whsec_ secrets: Standard Webhooks signatures', async () => {
  const { standardSignatureOk } = await import('../hooks.js');
  const { createHmac } = await import('node:crypto');
  const raw = Buffer.from('another-test-key-5678');
  const secret = 'whsec_' + raw.toString('base64');
  const body = '{"type":"call.completed"}';
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', raw).update(`msg_1.${ts}.${body}`).digest('base64');
  const h = (s) => new Map([['webhook-id', 'msg_1'], ['webhook-timestamp', ts], ['webhook-signature', s]]);
  assert.equal(await standardSignatureOk(h(`v1,${sig}`), body, secret), true);
  assert.equal(await standardSignatureOk(h(`v1,bad v1,${sig}`), body, secret), true);
  assert.equal(await standardSignatureOk(h('v1,bad'), body, secret), false);
});
