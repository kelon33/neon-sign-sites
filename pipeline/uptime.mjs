#!/usr/bin/env node
// Uptime check (run by the 2-hourly reply check): neonsignsites.com, the payment pages, a few emailed
// previews, and every launched customer site (on our side, /c/<domain>/, plus its Cloudflare hostname status
// via npm run launch -- --check). HEAD requests only, so preview visits are never counted.
//   npm run uptime     prints "All up." or one line per problem (exit code 1 when something is down)

import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (f, fallback) => readFile(f, 'utf8').then(JSON.parse).catch(() => fallback);

async function head(url) {
  for (let i = 0; i < 2; i++) {
    try { const r = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15000) }); if (r.status < 400) return r.status; if (i) return r.status; }
    catch (e) { if (i) return e.name === 'TimeoutError' ? 'timeout' : 'unreachable'; }
  }
}

const sent = await json(path.join(root, 'leads', 'sent.json'), []);
const slugs = [...new Set(sent.map((s) => s.slug))].slice(-3);
const urls = ['/', '/subscribe', '/go', '/terms', ...slugs.map((s) => `/p/${s}/`)].map((p) => `https://neonsignsites.com${p}`);
const customers = await readdir(path.join(root, 'customers')).catch(() => []);
for (const d of customers) urls.push(`https://neonsignsites.com/c/${d}/`);
const problems = [];
for (const u of urls) { const st = await head(u); if (typeof st !== 'number' || st >= 400) problems.push(`${u}: ${st}`); }
for (const d of customers) {
  // launch --check prints "www.<domain>: hostname <status>, certificate <status>." (exit code 0 either way).
  let out = '';
  try { out = execFileSync('node', [path.join(root, 'launch', 'cli.mjs'), '--check', '--domain', d], { stdio: 'pipe', timeout: 60000 }).toString(); }
  catch (e) { out = String(e.stdout ?? '') + String(e.message); }
  if (!/hostname active, certificate active/.test(out)) problems.push(`${d}: not fully live (${out.trim().split('\n').pop()})`);
}
console.log(problems.length ? problems.join('\n') : `All up (${urls.length} pages, ${customers.length} customer sites).`);
process.exitCode = problems.length ? 1 : 0;
