// "What we fixed": a small preview-only box (never on a launched site) under the first screen. It names
// 2-3 problems the site check really measured on their current site (site.json siteCheck: reasons and
// improvements from pipeline/find.mjs), each paired with what this page really has. No invented
// numbers: a load time is theirs as measured, and the rating is Google's. Friendly, never insulting.
import { esc } from './shared.mjs';

/** The fixes worth showing, most important first; each only when the preview really has the answer. */
export function fixesFor(d) {
  const sc = d.siteCheck;
  if (!sc) return [];
  const found = [...(sc.reasons ?? []), ...(sc.improvements ?? [])];
  const has = (re) => found.find((f) => re.test(f));
  const out = [];
  const add = (was, now) => out.push({ was, now });
  if (has(/^does not load/)) add('Your site wasn’t loading when we checked', 'this page is up and quick to open');
  if (has(/not mobile-friendly/)) add('Your site is hard to use on a phone', 'built for phones first, with big buttons');
  const slow = has(/^(loads in|slow \()/);
  const secs = slow?.match(/([\d.]+)\s*s/)?.[1];
  if (secs) add(`Your site took ${secs} seconds to load when we checked`, 'one light page that opens fast');
  if (has(/no tap-to-call/) && d.phone) add('No tap-to-call link', 'a call button right on the first screen');
  if (has(/no reviews on the site/) && d.rating?.score) add('Your reviews aren’t on your site', `your ${d.rating.score}★ Google rating${d.rating.count ? ` from ${d.rating.count} reviews` : ''} up front`);
  if (has(/no quote or booking form/)) add('No way to ask for a quote online', d.kit === 'detailing' ? 'a booking form that comes straight to you' : 'a quote form that comes straight to you');
  if (has(/no https/)) add('Browsers mark your site “Not secure” (no https)', 'secure https');
  if (has(/^(no photos|only \d+ photos?)/) && (d.gallery?.length ?? 0) >= 4) add('Few photos of your work on your site', 'a gallery of your real jobs');
  if (has(/almost empty/) && (d.services?.length ?? 0) >= 3) add('Very little on your site about what you do', 'your services laid out clearly');
  if (has(/no meta description/) && d.description) add('No description for Google search results', 'a clear one, written for Google');
  const year = has(/^copyright \d{4}/)?.match(/\d{4}/)?.[0];
  if (year) add(`Your site’s footer still says © ${year}`, 'kept up to date');
  return out.slice(0, 3);
}

const CSS = `.nss-fix{padding:28px 20px 8px}.nss-fix>div{max-width:760px;margin:0 auto;border-radius:18px;padding:20px 22px;background:color-mix(in srgb,currentColor 6%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 14%,transparent)}
.nss-fix h2{font:700 1.05rem/1.3 system-ui,-apple-system,sans-serif;margin:0 0 10px;letter-spacing:.01em}
.nss-fix ul{list-style:none;margin:0;padding:0;display:grid;gap:8px;font:400 15px/1.45 system-ui,-apple-system,sans-serif}
.nss-fix li{display:flex;gap:10px;align-items:baseline}.nss-fix li::before{content:"✓";font-weight:700;color:#2fbf71}
.nss-fix .was{opacity:.75}.nss-fix .now{font-weight:600}`;

/** Inserts the box right after the hero (below the first screen), previews only. */
export function withFixes(html, d) {
  if (!d.preview) return html;
  const items = fixesFor(d);
  if (!items.length) return html; // one real fix is still worth showing; none means no box
  const i = html.indexOf('<section class="hero">');
  const j = i < 0 ? -1 : html.indexOf('</section>', i);
  if (j < 0) return html;
  const box = `\n<section class="nss-fix" aria-label="What we fixed"><div><h2>What this page fixes</h2><ul>${items.map((f) => `<li><span><span class="was">${esc(f.was)}</span> → <span class="now">${esc(f.now)}</span></span></li>`).join('')}</ul></div></section>\n`;
  const at = j + '</section>'.length;
  return (html.slice(0, at) + box + html.slice(at)).replace('</style>', `${CSS}</style>`);
}
