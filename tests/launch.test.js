import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { connectEmail, registrarKey } from '../launch/connect.mjs';
import { cleanDomain } from '../launch/cli.mjs';

// A stand-in for the Workers static-assets binding: records what was asked for.
function fakeAssets(respond = () => new Response('ok')) {
  const seen = [];
  return { seen, fetch: async (req) => { seen.push(new URL(req.url).pathname); return respond(new URL(req.url)); } };
}

test('worker: neonsignsites.com is served as is', async () => {
  const ASSETS = fakeAssets();
  const res = await worker.fetch(new Request('https://neonsignsites.com/p/evergreen/'), { ASSETS });
  assert.deepEqual(ASSETS.seen, ['/p/evergreen/']);
  assert.equal(res.headers.get('x-robots-tag'), null);
});

test('worker: customer copies on neonsignsites.com are not indexed', async () => {
  const ASSETS = fakeAssets();
  const res = await worker.fetch(new Request('https://www.neonsignsites.com/c/example.com/'), { ASSETS });
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('worker: a customer domain gets its own folder, with or without www', async () => {
  const ASSETS = fakeAssets();
  await worker.fetch(new Request('https://www.example.com/'), { ASSETS });
  await worker.fetch(new Request('https://Example.com/img/hero.jpg'), { ASSETS });
  assert.deepEqual(ASSETS.seen, ['/c/example.com/', '/c/example.com/img/hero.jpg']);
});

test('worker: customer robots.txt allows indexing', async () => {
  const res = await worker.fetch(new Request('https://www.example.com/robots.txt'), { ASSETS: fakeAssets() });
  assert.match(await res.text(), /Allow: \//);
});

test('worker: asset redirects do not leak the /c/<domain> path', async () => {
  const ASSETS = fakeAssets((u) => new Response(null, { status: 307, headers: { location: `${u.pathname}/` } }));
  const res = await worker.fetch(new Request('https://www.example.com/about'), { ASSETS });
  assert.equal(res.headers.get('location'), '/about/');
});

test('launch: domains are cleaned, junk is refused', () => {
  assert.equal(cleanDomain('https://www.Example.com/contact'), 'example.com');
  assert.throws(() => cleanDomain('not a domain'));
});

test('launch: registrar names map to our steps', () => {
  assert.equal(registrarKey('GoDaddy.com, LLC'), 'godaddy');
  assert.equal(registrarKey('NameCheap, Inc.'), 'namecheap');
  assert.equal(registrarKey('Squarespace Domains II LLC'), 'squarespace');
  assert.equal(registrarKey('Some Small Registrar'), null);
});

test('launch: the connect email has both options, the exact record, and no password request', () => {
  const email = connectEmail({ business: 'Evergreen', domain: 'example.com', target: 'sites.neonsignsites.com', registrar: 'godaddy' });
  assert.match(email, /OPTION 1/);
  assert.match(email, /OPTION 2/);
  assert.match(email, /Name:\s+www/);
  assert.match(email, /Value: sites\.neonsignsites\.com/);
  assert.match(email, /Delegate Access/);
  assert.match(email, /never send me your password/);
  const generic = connectEmail({ business: 'X', domain: 'x.com', target: 't', registrar: null });
  assert.match(generic, /screen-share/);
});
