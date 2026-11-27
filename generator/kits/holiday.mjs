// Christmas and holiday lighting: the lawn kit's layout dressed for the season. A night sky with a
// row of Christmas trees wrapped in twinkling lights (or their own photo, when they have a good one),
// a garland of bulbs across the top, falling snow, pine green, berry red and warm gold.
//
// site.json fields: the same as the lawn kit (see kits/lawn.mjs).

import { renderLawn } from './lawn.mjs';

const BULBS = ['#ff4d4d', '#ffd35c', '#5cff8f', '#5cc8ff', '#fff4d6'];

/** A row of pine trees with strings of lights, drawn in SVG (no images needed). */
function treesScene() {
  const trees = [
    { x: 70, w: 190, h: 330 }, { x: 250, w: 140, h: 240 }, { x: 420, w: 230, h: 400 }, { x: 640, w: 160, h: 270 },
    { x: 820, w: 260, h: 450 }, { x: 1060, w: 170, h: 290 }, { x: 1230, w: 210, h: 360 }, { x: 1400, w: 150, h: 250 },
  ];
  let i = 0;
  const parts = trees.map((t) => {
    const base = 760;
    const tiers = [0, 1, 2].map((k) => {
      const top = base - t.h + k * t.h * 0.24;
      const bottom = base - t.h * (0.42 - k * 0.21);
      const half = (t.w / 2) * (0.62 + k * 0.19);
      return `<path d="M${t.x} ${top} L${t.x + half} ${bottom} L${t.x - half} ${bottom} Z" fill="#0c3a24"/>`;
    }).join('');
    // Strings of lights: diagonal rows of bulbs across the tree.
    const bulbs = [];
    for (let r = 1; r <= 6; r++) {
      const y = base - t.h + (r / 7) * t.h * 0.9;
      const span = (t.w / 2) * (0.25 + (r / 7) * 0.75);
      for (let b = -2; b <= 2; b++) {
        const x = t.x + (b / 2.4) * span;
        const yy = y + b * 6;
        const c = BULBS[i % BULBS.length];
        bulbs.push(`<circle class="bulb" cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="4.2" fill="${c}" style="--d:${((i * 0.37) % 2.4).toFixed(2)}s;color:${c}"/>`);
        i++;
      }
    }
    const star = `<path class="star" d="M${t.x} ${base - t.h - 16} l5 11 12 1 -9 8 3 12 -11 -6 -11 6 3 -12 -9 -8 12 -1z" fill="#ffd35c"/>`;
    return `<g>${tiers}<rect x="${t.x - 9}" y="${base - t.h * 0.2}" width="18" height="${t.h * 0.2}" fill="#3b2414"/>${bulbs.join('')}${star}</g>`;
  });
  return `<svg class="scene" viewBox="0 0 1500 760" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#071225"/><stop offset=".7" stop-color="#0d2a3a"/><stop offset="1" stop-color="#123a2c"/></linearGradient></defs>
<rect width="1500" height="760" fill="url(#sky)"/>
${parts.join('\n')}
<path d="M0 744 Q 180 722 380 742 T 760 738 T 1140 744 T 1500 734 L1500 760 L0 760 Z" fill="#e6eef3"/>
<path d="M0 752 Q 260 738 520 752 T 1040 750 T 1500 748 L1500 760 L0 760 Z" fill="#f7fbfd"/>
</svg>`;
}

/** A garland of bulbs hanging across the top of the hero. */
function garland() {
  const bulbs = [];
  for (let k = 0; k <= 30; k++) {
    const x = (k / 30) * 1500;
    const y = 22 + Math.sin((k / 30) * Math.PI * 6) ** 2 * 26;
    const c = BULBS[k % BULBS.length];
    bulbs.push(`<g class="bulb" style="--d:${((k * 0.29) % 2.2).toFixed(2)}s;color:${c}"><rect x="${(x - 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="4" height="5" fill="#2a2a2a"/><ellipse cx="${x.toFixed(1)}" cy="${(y + 8).toFixed(1)}" rx="5" ry="9" fill="${c}"/></g>`);
  }
  const wire = Array.from({ length: 61 }, (_, k) => { const x = (k / 60) * 1500; const y = 18 + Math.sin((k / 60) * Math.PI * 6) ** 2 * 26; return `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(' ');
  return `<svg class="garland" viewBox="0 0 1500 70" preserveAspectRatio="none" aria-hidden="true"><path d="${wire}" stroke="#1d1d1d" stroke-width="2" fill="none"/>${bulbs.join('')}</svg>`;
}

const CSS = `
/* Holiday lighting: pine, berry red, warm gold, a night sky and snow. */
:root { --grass: #b3122e; --grass-hi: #ff5a6e; --grass-lo: #8d0f25; --stripe-a: #b3122e; --stripe-b: #f5efe6;
  --deep: #0c2d1f; --deeper: #071c13; --sun: #f5c04a; --mint: #f6eee4;
  --bg: #fbf7f0; --panel: #ffffff; --ink: #1d1a17; --muted: #6a6158; --line: #ece2d4; }
.photo { filter: none; }
.hero { background: #071225; }
.hero .scene { position: absolute; inset: 0; width: 100%; height: 100%; z-index: -2; }
.hero::before { background: ${'${VEIL}'}; }
.hero h1 em, .hero .eyebrow { color: #ffd35c; }
.hero .garland { position: absolute; top: 0; left: 0; width: 100%; height: 70px; z-index: 1; pointer-events: none; }
.top { top: 30px; }
.bulb { filter: drop-shadow(0 0 6px currentColor) drop-shadow(0 0 14px currentColor); animation: twinkle 2.4s ease-in-out infinite; animation-delay: var(--d); }
.star { filter: drop-shadow(0 0 10px #ffd35c); }
@keyframes twinkle { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
.snow { position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background-image: radial-gradient(2px 2px at 20px 30px, #fff, transparent), radial-gradient(2px 2px at 80px 120px, #fff, transparent), radial-gradient(1.5px 1.5px at 150px 60px, #fff, transparent), radial-gradient(2.5px 2.5px at 210px 160px, #fff, transparent), radial-gradient(1.5px 1.5px at 260px 20px, #fff, transparent);
  background-size: 300px 220px; opacity: .75; animation: snow 14s linear infinite; }
@keyframes snow { to { background-position: 60px 440px; } }
/* Candy-stripe band and a red-and-gold eyebrow. */
.promise { background: repeating-linear-gradient(135deg, #b3122e 0 46px, #c81d3a 46px 92px); }
.eyebrow { color: #b3122e; }
.service { border-top-color: #b3122e; }
@media (hover: hover) { .service:hover { box-shadow: 0 22px 44px -28px rgba(120,10,30,.4); } }
dialog.lightbox::backdrop { background: rgba(5,12,20,.92); }
@media (prefers-reduced-motion: reduce) { .snow, .bulb { animation: none; } }
`;

export function renderHoliday(d) {
  const html = renderLawn({
    ...d,
    promise: d.promise ?? null,
    galleryTitle: d.galleryTitle ?? 'Homes we light up.',
    notePlaceholder: d.notePlaceholder ?? 'Roofline length, trees, a date you want them up…',
  });
  for (const must of ['</style>', '<section class="hero">', '<meta name="theme-color" content="#1d4a22">'])
    if (!html.includes(must)) throw new Error(`holiday kit: the lawn kit changed shape (${must})`);
  // Their own photo stays the hero when they have one; otherwise the trees scene.
  const veil = d.heroImage
    ? 'linear-gradient(90deg, rgba(5,14,24,.88) 0%, rgba(5,14,24,.65) 42%, rgba(5,14,24,.15) 80%), linear-gradient(180deg, rgba(5,14,24,.6), transparent 35%)'
    : 'linear-gradient(90deg, rgba(5,14,24,.7) 0%, rgba(5,14,24,.35) 45%, rgba(5,14,24,0) 75%)';
  const scene = `${d.heroImage ? '' : treesScene()}${garland()}<div class="snow"></div>`;
  return html
    .replace('</style>', `${CSS.replace('${VEIL}', veil)}</style>`)
    .replace('<section class="hero">', `<section class="hero">${scene}`)
    .replace('<meta name="theme-color" content="#1d4a22">', '<meta name="theme-color" content="#071225">');
}
