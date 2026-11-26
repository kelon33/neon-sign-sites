#!/usr/bin/env node
// Publishes neonsignsites.com: the site (site/) plus every preview in demos/<slug>/
// at /p/<slug>/. Previews are never indexed (robots.txt, X-Robots-Tag and a noindex tag).
//   node deploy.mjs --dry   → builds dist/ only. Cloudflare Pages runs exactly this on every push
//                             to main (build command) and publishes dist/.
//   npm run deploy          → builds and uploads with wrangler from a computer. Not from a cloud
//                             session: its proxy replaces wrangler's upload token.

import { cp, mkdir, rm, readdir, writeFile, stat } from 'node:fs/promises';
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
await writeFile(path.join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /p/\n\nSitemap: https://neonsignsites.com/sitemap.xml\n');
await writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['', 'terms', 'privacy'].map((p) => `  <url><loc>https://neonsignsites.com/${p}</loc></url>`).join('\n')}
</urlset>
`);
await writeFile(path.join(dist, '_headers'), '/p/*\n  X-Robots-Tag: noindex, nofollow\n');
console.log(`Built ${dist} with ${published.length} previews: ${published.join(', ')}`);

if (!process.argv.includes('--dry')) {
  // wrangler wants a token variable; the proxy replaces this placeholder with the real token.
  execFileSync('npx', ['--yes', 'wrangler@3', 'pages', 'deploy', dist, '--project-name', PROJECT, '--branch', 'main', '--commit-dirty=true'], {
    stdio: 'inherit',
    env: { ...process.env, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN ?? 'proxy-injected', CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? JSON.parse(await (await import('node:fs/promises')).readFile(path.join(root, 'config.json'), 'utf8')).cloudflareAccountId },
  });
}
