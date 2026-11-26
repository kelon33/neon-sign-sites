#!/usr/bin/env node
// Launching a customer's site on their own domain:
//   npm run launch -- --slug <demo-slug> --domain <their-domain.com> [--registrar godaddy|namecheap|...]
//     1. renders the live version (no preview bar, indexable) into customers/<domain>/
//     2. registers www.<domain> with Cloudflare for SaaS, so its SSL certificate is issued automatically
//     3. writes connect-email.txt: how the customer connects the domain (do it yourself, or let us)
//   npm run launch -- --check --domain <their-domain.com>
//     checks whether the domain points at us yet and the certificate is active.
// A push to main publishes customers/<domain>/ (deploy.mjs → dist/c/<domain>/, served by worker.js).
// Cloudflare steps need the API (api.cloudflare.com) and a token with "SSL and Certificates: Edit"
// on the neonsignsites.com zone; without them the script says so and does the rest.

import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSite } from '../generator/render.mjs';
import { connectEmail, lookupRegistrar, registrarKey, REGISTRARS } from './connect.mjs';
import { createHostname, findHostname } from './cloudflare.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

export function cleanDomain(input) {
  const d = String(input ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').replace(/\.$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new Error(`"${input}" doesn't look like a domain (e.g. example.com).`);
  return d;
}

async function main() {
  const config = JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8'));
  const target = config.customerTarget;
  const domain = cleanDomain(arg('domain'));
  const dir = path.join(root, 'customers', domain);

  if (args.includes('--check')) {
    const h = await findHostname(config, `www.${domain}`);
    if (!h) return console.log(`www.${domain} is not registered with Cloudflare yet (run the launch first).`);
    console.log(`www.${domain}: hostname ${h.status}, certificate ${h.ssl?.status ?? 'unknown'}.`);
    if (h.status === 'active' && h.ssl?.status === 'active') console.log(`Live: https://www.${domain}/`);
    else console.log(`Not live yet. The customer still needs the CNAME www → ${target} (or it hasn't spread yet).`);
    return;
  }

  const slug = arg('slug');
  if (!slug) { console.log('npm run launch -- --slug <demo-slug> --domain <their-domain.com> [--registrar godaddy]'); process.exit(1); }
  const demo = path.join(root, 'demos', slug);
  const data = JSON.parse(await readFile(path.join(demo, 'site.json'), 'utf8'));

  // 1. The live site: same content as the approved preview, without the preview bar and noindex.
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), renderSite({ ...data, preview: false }));
  for (const f of await readdir(demo)) {
    if (f === 'img' || /^logo.*\.(png|svg|jpe?g|webp)$/.test(f)) await cp(path.join(demo, f), path.join(dir, f), { recursive: true });
  }
  console.log(`Live version → customers/${domain}/ (published on the next push to main)`);

  // 2. Cloudflare for SaaS: register www.<domain> so the certificate is issued once their CNAME is in.
  const checks = [];
  try {
    const existing = await findHostname(config, `www.${domain}`);
    const h = existing ?? await createHostname(config, `www.${domain}`);
    console.log(`Cloudflare: www.${domain} ${existing ? 'already registered' : 'registered'} (${h.status}).`);
  } catch (e) {
    checks.push(`Cloudflare step not done: ${e.message}. Run the launch again where the API is reachable.`);
  }

  // 3. The customer's instructions, for their registrar.
  let registrar = arg('registrar');
  let registrarName = registrar ? REGISTRARS[registrar]?.name : await lookupRegistrar(domain);
  if (!registrar) registrar = registrarKey(registrarName);
  if (!registrar) checks.push(`Registrar ${registrarName ? `"${registrarName}" has no specific steps yet` : 'not found'}: the email uses general steps. Check them, or pass --registrar.`);
  const email = connectEmail({ business: data.name, domain, target, registrar });
  await writeFile(path.join(dir, 'connect-email.txt'), email);
  await writeFile(path.join(dir, 'launch.json'), JSON.stringify({ slug, domain, host: `www.${domain}`, target, registrar: registrar ?? null, registrarName: registrarName ?? null, launched: new Date().toISOString().slice(0, 10) }, null, 1) + '\n');
  console.log(`Customer email → customers/${domain}/connect-email.txt (registrar: ${registrarName ?? 'unknown'})`);
  for (const c of checks) console.log(`! ${c}`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
