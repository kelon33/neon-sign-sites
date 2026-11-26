// Connecting a customer's own domain to their new site: registrar detection and the email that
// tells them how. Two choices for the customer:
//   1. Do it themselves: one DNS record and one forwarding setting, with the exact values filled in.
//   2. Let us do it: they give us delegate access at their registrar (never their password), or a
//      short screen-share.
// (A one-click "Connect" button through Domain Connect comes later, once a registrar approves us.)

/** Registrars we have specific steps for, matched against the RDAP registrar name. */
export const REGISTRARS = {
  godaddy: {
    name: 'GoDaddy',
    match: /godaddy|wild west domains/i,
    dns: 'Sign in at godaddy.com, open My Products, find {domain} and click DNS (or "Manage DNS").',
    forward: 'On the same page, open Forwarding (or the Forwarding tab), add a forward for {domain} to https://www.{domain}, type Permanent (301).',
    delegate: 'GoDaddy lets you give access without sharing your password: in your account settings, open "Delegate Access", invite {us} and allow "Products, Domains & Purchase" (or "Products & Domains").',
  },
  namecheap: {
    name: 'Namecheap',
    match: /namecheap/i,
    dns: 'Sign in at namecheap.com, open Domain List, click Manage next to {domain}, then the Advanced DNS tab.',
    forward: 'In Advanced DNS, under "Redirect Domain", add a redirect from {domain} to https://www.{domain}, type Permanent (301).',
    delegate: 'Namecheap lets you share access without your password: in Domain List, open {domain}, choose "Sharing & Transfer" and share it with {us}.',
  },
  squarespace: {
    name: 'Squarespace Domains',
    match: /squarespace|google/i,
    dns: 'Sign in at domains.squarespace.com, click {domain}, then DNS (DNS Settings).',
    forward: 'Under Domain Forwarding, forward {domain} to https://www.{domain} as a permanent redirect.',
    delegate: null,
  },
  ionos: {
    name: 'IONOS',
    match: /ionos|1&1|1and1/i,
    dns: 'Sign in at ionos.com, open Domains & SSL, click {domain}, then DNS.',
    forward: 'In the domain settings, set {domain} to redirect (HTTP redirect, permanent) to https://www.{domain}.',
    delegate: null,
  },
  cloudflare: {
    name: 'Cloudflare',
    match: /cloudflare/i,
    dns: 'Sign in at dash.cloudflare.com, open {domain}, then DNS → Records.',
    forward: 'Add a Redirect Rule (Rules → Redirect Rules) from {domain} to https://www.{domain}, status 301.',
    delegate: 'Cloudflare lets you add a member without sharing your password: Manage Account → Members → invite {us}.',
  },
};

/** Which of our registrars a registrar name (from RDAP) is, or null. */
export function registrarKey(registrarName) {
  if (!registrarName) return null;
  for (const [key, r] of Object.entries(REGISTRARS)) if (r.match.test(registrarName)) return key;
  return null;
}

/** Looks up the registrar's name with RDAP (the public successor of WHOIS). Null when it can't tell. */
export async function lookupRegistrar(domain, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { headers: { accept: 'application/rdap+json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const reg = (data.entities ?? []).find((e) => (e.roles ?? []).includes('registrar'));
    const fn = reg?.vcardArray?.[1]?.find((f) => f[0] === 'fn');
    return fn?.[3] ?? null;
  } catch {
    return null;
  }
}

const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? `{${k}}`);

/** The email that tells the customer how to connect their domain. */
export function connectEmail({ business, domain, target, registrar, us = 'alon@neonsignsites.com', sender = 'Alon Katz' }) {
  const r = REGISTRARS[registrar];
  const v = { domain, us };
  const where = r ? fill(r.dns, v) : `Sign in where you bought ${domain} and open its DNS settings (sometimes called "DNS records", "Zone editor" or "Advanced DNS").`;
  const forward = r ? fill(r.forward, v) : `Look for "Forwarding" or "Redirect" and forward ${domain} to https://www.${domain} as a permanent (301) redirect.`;
  const delegate = r?.delegate ? fill(r.delegate, v) : null;

  return `Subject: Putting your new ${business} site live on ${domain}

Hi,

Your new site is ready to go live on ${domain}. There are two ways to connect it. Pick whichever is easier for you.

OPTION 1: Do it yourself (about 5 minutes)

1. ${where}
2. Add this record (if a "www" record already exists, edit it instead):
     Type:  CNAME
     Name:  www
     Value: ${target}
     TTL:   leave the default
3. ${forward}

That's all. Don't change any other records: your email keeps working exactly as it does today. Reply "done" and I'll check it and let you know when the site is live (usually within an hour).

OPTION 2: Let me do it for you

${delegate ? `${delegate} Then reply "access sent" and I'll take it from there.

Or, if you prefer, we can do it together on a 10-minute screen-share.` : `Reply with a good time for a 10-minute screen-share and we'll do it together.`}

Please never send me your password.

${sender}
Neon Sign Sites
`;
}
