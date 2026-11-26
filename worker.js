// Neon Sign Sites Worker: serves neonsignsites.com and every launched customer site.
//   neonsignsites.com (and www)  → the static site and previews (dist/, /p/<slug>/)
//   any other host (a customer)  → that customer's site, from dist/c/<domain>/
// Customer domains reach us through Cloudflare for SaaS (custom hostnames): the customer points
// www.<domain> at us with one CNAME and forwards <domain> to www.<domain> at their registrar.

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
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    if (OWN.has(host) || host.endsWith('.workers.dev')) {
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
