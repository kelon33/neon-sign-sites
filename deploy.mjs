#!/usr/bin/env node
// Publishes neonsignsites.com: the site (site/) plus every preview in demos/<slug>/
// at /p/<slug>/. Previews are never indexed (robots.txt, X-Robots-Tag and a noindex tag).
//   node deploy.mjs --dry   → builds dist/ only. Cloudflare (Workers Builds) runs this on every push
//                             to main, then `npx wrangler deploy` publishes dist/ (see wrangler.jsonc).
//   npm run deploy          → builds and uploads with wrangler from a computer. Not from a cloud
//                             session: its proxy replaces wrangler's upload token.

import { cp, mkdir, rm, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const PROJECT = 'neonsignsites';

await rm(dist, { recursive: true, force: true });
await cp(path.join(root, 'site'), dist, { recursive: true });
const demos = path.join(root, 'demos');
const published = [];
for (const slug of await readdir(demos)) {
  const dir = path.join(demos, slug);
  try { await stat(path.join(dir, 'index.html')); } catch { continue; }
  const to = path.join(dist, 'p', slug);
  await mkdir(to, { recursive: true });
  await cp(path.join(dir, 'index.html'), path.join(to, 'index.html'));
  for (const extra of ['img', 'logo.png', 'logo-mark.png', 'logo-white.png']) {
    await cp(path.join(dir, extra), path.join(to, extra), { recursive: true }).catch(() => {});
  }
  published.push(slug);
}
// Launched customer sites: customers/<domain>/ → dist/c/<domain>/, served on their own domain by worker.js.
const customers = path.join(root, 'customers');
const launched = [];
for (const domain of await readdir(customers).catch(() => [])) {
  const dir = path.join(customers, domain);
  try { await stat(path.join(dir, 'index.html')); } catch { continue; }
  const to = path.join(dist, 'c', domain);
  await mkdir(to, { recursive: true });
  for (const f of await readdir(dir)) {
    if (f === 'index.html' || f === 'img' || /^logo.*\.(png|svg|jpe?g|webp)$/.test(f)) await cp(path.join(dir, f), path.join(to, f), { recursive: true });
  }
  launched.push(domain);
}
// Cloudflare Web Analytics (config.json analyticsToken): page views for the site and every preview,
// so we can see who opened their preview. Never on customer sites (dist/c/).
const { analyticsToken } = JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8'));
if (analyticsToken) {
  const beacon = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${analyticsToken}"}'></script>`;
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { if (f !== path.join(dist, 'c')) await walk(f); continue; }
      if (!e.name.endsWith('.html')) continue;
      const html = await readFile(f, 'utf8');
      if (!html.includes('cloudflareinsights')) await writeFile(f, html.replace(/<\/body>(?![\s\S]*<\/body>)/, `${beacon}\n</body>`));
    }
  };
  await walk(dist);
}
await writeFile(path.join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /p/\n\nSitemap: https://neonsignsites.com/sitemap.xml\n');
await writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['', 'terms', 'privacy'].map((p) => `  <url><loc>https://neonsignsites.com/${p}</loc></url>`).join('\n')}
</urlset>
`);
await writeFile(path.join(dist, '_headers'), '/p/*\n  X-Robots-Tag: noindex, nofollow\n');
console.log(`Built ${dist} with ${published.length} previews: ${published.join(', ')}; ${launched.length} customer sites${launched.length ? ': ' + launched.join(', ') : ''}`);

if (!process.argv.includes('--dry')) {
  // wrangler wants a token variable; the proxy replaces this placeholder with the real token.
  execFileSync('npx', ['--yes', 'wrangler@3', 'pages', 'deploy', dist, '--project-name', PROJECT, '--branch', 'main', '--commit-dirty=true'], {
    stdio: 'inherit',
    env: { ...process.env, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN ?? 'proxy-injected', CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? JSON.parse(await (await import('node:fs/promises')).readFile(path.join(root, 'config.json'), 'utf8')).cloudflareAccountId },
  });
}
