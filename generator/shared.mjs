// Helpers every kit uses.

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const tel = (phone) => `tel:+1${String(phone).replace(/\D/g, '').replace(/^1/, '')}`;

/** A darker and a lighter shade of the brand colour, for depth. */
export function shade(hex, amount) {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}


// Preview only: the "make it live" path. A banner at the top and a closing block at the end lead to
// neonsignsites.com/go/ with the preview's slug, so Alon knows which preview the request is for.
// (Not a pinned bar: the kits already pin call/quote buttons to the bottom on phones.)
const GO = 'https://neonsignsites.com/go';
const previewCss = `
/* One line, a fixed 40px: the kits subtract --bar from the hero so the first screen still fits (npm run fold). */
:root:has(.nss-bar) { --bar: 48px; }
.nss-bar { background: #0b0b10; color: #e9e6ef; font: 500 13px/1.4 system-ui, -apple-system, sans-serif; display: flex; flex-wrap: nowrap; justify-content: center; align-items: center; gap: 14px; height: 48px; box-sizing: border-box; padding: 0 12px; text-align: center; white-space: nowrap; overflow: hidden;
  position: sticky; top: 0; z-index: 60; box-shadow: 0 6px 18px -10px rgba(0,0,0,.6); }
.nss-bar > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 600px) { .nss-bar .nss-for, .nss-bar .nss-yet { display: none; } }
.nss-bar a { color: #ff7aa8; }
.nss-bar .nss-go { flex: none; color: #0b0b10; background: #ff4f8b; border-radius: 999px; padding: 8px 20px; font-size: 15px; font-weight: 800; text-decoration: none; white-space: nowrap; box-shadow: 0 0 0 0 rgba(255,79,139,.55); animation: nss-glow 2.8s ease-out 1.5s 3; }
.nss-bar .nss-go:hover { background: #ff6b9e; }
.nss-bar .nss-go small { font-weight: 600; opacity: .8; font-size: 13px; }
@media (max-width: 600px) { .nss-bar .nss-go small { display: none; } }
@keyframes nss-glow { 0% { box-shadow: 0 0 0 0 rgba(255,79,139,.55); } 70% { box-shadow: 0 0 0 12px rgba(255,79,139,0); } 100% { box-shadow: 0 0 0 0 rgba(255,79,139,0); } }
@media (prefers-reduced-motion: reduce) { .nss-bar .nss-go { animation: none; } }
.nss-end { background: #0b0b10; color: #f3f0e9; text-align: center; padding: 56px 20px 140px; font: 400 16px/1.5 system-ui, -apple-system, sans-serif; }
.nss-end h2 { font: 600 1.6rem/1.2 system-ui, -apple-system, sans-serif; margin: 0 0 8px; color: #fff; }
.nss-end p { color: #a9a6b2; margin: 0 auto 22px; max-width: 30em; }
.nss-end .nss-opts { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
.nss-end .nss-opts a { text-decoration: none; border-radius: 999px; padding: 14px 24px; font-weight: 700; }
.nss-end .nss-main { background: #ff4f8b; color: #0b0b10; box-shadow: 0 10px 30px -8px rgba(255,79,139,.6); }
.nss-end .nss-alt { color: #f3f0e9; box-shadow: inset 0 0 0 1px #3a3a4a; }
.nss-end small { display: block; color: #8a8794; margin-top: 16px; font-size: 13px; }`;

export function previewTop(d, esc) {
  return `<style>${previewCss}</style>
<div class="nss-bar"><span>Preview <span class="nss-for">prepared for ${esc(d.name)} </span>by <a href="https://neonsignsites.com/">Neon Sign Sites</a>.<span class="nss-yet"> Not the live site yet.</span></span><a class="nss-go" data-plan="monthly" href="${GO}?plan=monthly">Make it live <small>· $0 to start</small></a></div>`;
}

export function previewEnd(d, esc) {
  return `<section class="nss-end" aria-label="Make this site live">
  <h2>Like it? It can go live in a few days.</h2>
  <p>On your own domain, with hosting and SSL included. Your email and everything else stay as they are.</p>
  <div class="nss-opts"><a class="nss-main" data-plan="monthly" href="${GO}?plan=monthly">$0 first month</a><a class="nss-alt" data-plan="own" href="${GO}?plan=own">Own it for $299</a></div>
  <small>Monthly: then $49/month, minimum 2 paid months after the free one. Own it: $299 once, hosting included the first year, then $49/year. Prepared by Neon Sign Sites.</small>
</section>
<script>(function(){var s=(location.pathname.match(/\\/p\\/([a-z0-9-]+)/)||[])[1];var n=${JSON.stringify(String(d.name ?? '')).replace(/</g, '\\u003c')};document.querySelectorAll('a[data-plan]').forEach(function(a){var u=new URL(a.href);if(s)u.searchParams.set('site',s);u.searchParams.set('name',n);a.href=u.toString();});})();</script>`;
}
