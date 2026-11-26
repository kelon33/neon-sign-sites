import test from 'node:test';
import assert from 'node:assert/strict';
import { previewRequest, makeItLive } from '../forms.js';
import { renderSite } from '../generator/render.mjs';
import { readFile } from 'node:fs/promises';

const post = (fields) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request('https://neonsignsites.com/api/x', { method: 'POST', body });
};
function fakeResend(ok = true) {
  const sent = [];
  return { sent, fetch: async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response('{}', { status: ok ? 200 : 500 }); } };
}
const env = { RESEND_API_KEY: 'test', NOTIFY_TO: 'alon@example.com' };

test('preview request: emails Alon and thanks the visitor', async () => {
  const r = fakeResend();
  const res = await previewRequest(post({ business: 'Evergreen', website: 'evergreen.com', email: 'owner@evergreen.com' }), env, r.fetch);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/thanks?for=preview');
  assert.equal(r.sent[0].body.to[0], 'alon@example.com');
  assert.equal(r.sent[0].body.reply_to, 'owner@evergreen.com');
  assert.match(r.sent[0].body.text, /Evergreen/);
});

test('preview request: bad input and failed email show an error, bots get no email', async () => {
  assert.equal((await previewRequest(post({ business: 'X', website: 'x.com', email: 'nope' }), env, fakeResend().fetch)).status, 400);
  assert.equal((await previewRequest(post({ business: 'X', website: 'x.com', email: 'a@b.co' }), env, fakeResend(false).fetch)).status, 400);
  assert.equal((await previewRequest(post({ business: 'X', website: 'x.com', email: 'a@b.co' }), {}, fakeResend().fetch)).status, 400);
  const r = fakeResend();
  const res = await previewRequest(post({ business: 'X', website: 'x.com', email: 'a@b.co', nickname: 'bot' }), env, r.fetch);
  assert.equal(res.status, 303);
  assert.equal(r.sent.length, 0);
});

test('make it live: needs the terms, goes to the plan payment link, or thanks while there is none', async () => {
  const f = { plan: 'own', site: 'evergreen-outdoor-services', business: 'Evergreen', name: 'Sam', email: 'sam@e.com', terms: 'yes' };
  assert.equal((await makeItLive(post({ ...f, terms: '' }), env, fakeResend().fetch)).status, 400);
  const r = fakeResend();
  const res = await makeItLive(post(f), { ...env, PAYPAL_OWN_URL: 'https://pay.example/own' }, r.fetch);
  assert.equal(res.headers.get('location'), 'https://pay.example/own');
  assert.match(r.sent[0].body.text, /neonsignsites\.com\/p\/evergreen-outdoor-services\//);
  assert.match(r.sent[0].body.subject, /\$299/);
  const later = await makeItLive(post({ ...f, plan: 'monthly' }), env, fakeResend().fetch);
  assert.equal(later.headers.get('location'), '/thanks?for=go&plan=monthly');
});

test('previews lead to the make-it-live page; live sites do not', async () => {
  const d = JSON.parse(await readFile('demos/evergreen-outdoor-services/site.json', 'utf8'));
  assert.match(renderSite(d), /neonsignsites\.com\/go\?plan=monthly/);
  assert.match(renderSite(d), /minimum 2 paid months/);
  assert.doesNotMatch(renderSite({ ...d, preview: false }), /neonsignsites\.com\/go\?/);
});
