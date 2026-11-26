// Cloudflare for SaaS custom hostnames (https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/).
// Needs config.json cloudflareZoneId (the neonsignsites.com zone) and a token with
// "SSL and Certificates: Edit" on that zone: CLOUDFLARE_API_TOKEN, or injected by the session's proxy.

const API = 'https://api.cloudflare.com/client/v4';

async function cf(config, method, route, body) {
  if (!config.cloudflareZoneId) throw new Error('config.json has no cloudflareZoneId');
  const token = process.env.CLOUDFLARE_API_TOKEN || 'injected-by-proxy';
  let res;
  try {
    res = await fetch(`${API}/zones/${config.cloudflareZoneId}${route}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('the Cloudflare API is not reachable from here');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const msg = data.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    throw new Error(`Cloudflare said: ${msg}`);
  }
  return data.result;
}

export async function findHostname(config, hostname) {
  const list = await cf(config, 'GET', `/custom_hostnames?hostname=${encodeURIComponent(hostname)}`);
  return list?.[0] ?? null;
}

/** Registers a customer hostname. HTTP validation: the certificate is issued once their CNAME points at us. */
export function createHostname(config, hostname) {
  return cf(config, 'POST', '/custom_hostnames', { hostname, ssl: { method: 'http', type: 'dv' } });
}
