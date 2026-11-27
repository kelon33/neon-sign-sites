// Neon Sign Sites Worker: serves neonsignsites.com and every launched customer site.
//   neonsignsites.com (and www)  → the static site and previews (dist/, /p/<slug>/)
//   any other host (a customer)  → that customer's site, from dist/c/<domain>/
// Customer domains reach us through Cloudflare for SaaS (custom hostnames): the customer points
// www.<domain> at us with one CNAME and forwards <domain> to www.<domain> at their registrar.

import { previewRequest, makeItLive } from './forms.js';
import { eventOf, record, allEvents } from './events.js';
import { quoHook, paypalHook } from './hooks.js';

const OWN = new Set(['neonsignsites.com', 'www.neonsignsites.com', 'localhost', '127.0.0.1']);

// The customer folder for a host: "www.example.com" and "example.com" both → "example.com".
// (Not exported: a Worker module should export only its handler.)
function customerDomain(host) {
  return host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

function withHeader(res, name, value) {
  const out = new Response(res.body, res);
  out.headers.set(name, value);
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    if (OWN.has(host) || host.endsWith('.workers.dev')) {
      // The dashboard only through Cloudflare Access on neonsignsites.com (Access adds the header);
      // never on www, workers.dev or a customer domain, which Access does not cover.
      if (url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/')) {
        if (host !== 'neonsignsites.com' || !request.headers.get('cf-access-jwt-assertion')) return new Response('Not found', { status: 404 });
        if (url.pathname === '/dashboard/api/events') {
          return new Response(JSON.stringify(await allEvents(env)), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'X-Robots-Tag': 'noindex' } });
        }
        return withHeader(await env.ASSETS.fetch(request), 'X-Robots-Tag', 'noindex, nofollow');
      }
      if (request.method === 'POST' && url.pathname === '/hooks/quo') return quoHook(request, env);
      if (request.method === 'POST' && url.pathname === '/hooks/paypal') return paypalHook(request, env);
      if (request.method === 'POST' && url.pathname === '/api/preview-request') return previewRequest(request, env);
      if (request.method === 'POST' && url.pathname === '/api/go') {
        // Count the "Make it live" click for the dashboard (from the form's own fields, before it is read).
        const f = await request.clone().formData().catch(() => null);
        const slug = String(f?.get('site') ?? '').replace(/[^a-z0-9-]/g, '').slice(0, 80);
        if (slug && !/TEST by Claude/.test(String(f?.get('business') ?? ''))) ctx?.waitUntil(record(env, 'm', slug, { plan: String(f.get('plan') ?? '').slice(0, 10) }).catch(() => {}));
        return makeItLive(request, env);
      }
      const ev = eventOf(request, url);
      if (ev) ctx?.waitUntil(record(env, ev.kind, ev.slug).catch(() => {}));
      const res = await env.ASSETS.fetch(request);
      // Customer sites are also reachable at /c/<domain>/ here: keep those copies out of search engines.
      return url.pathname.startsWith('/c/') ? withHeader(res, 'X-Robots-Tag', 'noindex, nofollow') : res;
    }

    const domain = customerDomain(host);
    if (url.pathname === '/robots.txt') {
      return new Response(`User-agent: *\nAllow: /\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    const prefix = `/c/${domain}`;
    const assetUrl = new URL(prefix + url.pathname + url.search, url.origin);
    const res = await env.ASSETS.fetch(new Request(assetUrl, request));

    // Asset redirects (e.g. adding a trailing slash) must not leak the /c/<domain> path.
    const location = res.headers.get('location');
    if (location) {
      const to = new URL(location, assetUrl);
      if (to.pathname.startsWith(prefix)) {
        to.pathname = to.pathname.slice(prefix.length) || '/';
        to.host = url.host;
        const out = new Response(res.body, res);
        out.headers.set('location', to.pathname + to.search);
        return out;
      }
    }
    return res;
  },
};
