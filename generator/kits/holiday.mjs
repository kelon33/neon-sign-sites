// Christmas and holiday lighting: the lawn kit's layout dressed for the season, with pine green,
// berry red and warm gold, and a candy-stripe band.
// The hero is their own photo when they have a good one. Otherwise it is a real, licensed night photo
// of snowy trees in warm lights (assets/holiday-trees.jpg, CC BY 2.0, credited on the page and in
// assets/CREDITS.md), never presented as their work: the pipeline notes it in check.txt.
//
// site.json fields: the same as the lawn kit (see kits/lawn.mjs).

import { readFileSync } from 'node:fs';
import { renderLawn } from './lawn.mjs';

const TREES = `data:image/jpeg;base64,${readFileSync(new URL('../assets/holiday-trees.jpg', import.meta.url)).toString('base64')}`;
export const HOLIDAY_PHOTO_CREDIT = 'Photo: epSos.de, CC BY 2.0';
const CREDIT_URL = 'https://commons.wikimedia.org/wiki/File:Glowing_Christmas_Tree_Lights_in_the_Winter_Night.jpg';

const CSS = `
/* Holiday lighting: pine, berry red, warm gold. */
:root { --grass: #b3122e; --grass-hi: #ff5a6e; --grass-lo: #8d0f25; --stripe-a: #b3122e; --stripe-b: #f5efe6;
  --deep: #0c2d1f; --deeper: #071c13; --sun: #f5c04a; --mint: #f6eee4;
  --bg: #fbf7f0; --panel: #ffffff; --ink: #1d1a17; --muted: #6a6158; --line: #ece2d4; }
.photo, .hero > img { filter: none; }
.hero { background: #071225; }
.hero::before { background: linear-gradient(90deg, rgba(5,14,24,.86) 0%, rgba(5,14,24,.6) 42%, rgba(5,14,24,.1) 80%), linear-gradient(180deg, rgba(5,14,24,.55), transparent 35%); }
.hero h1 em, .hero .eyebrow { color: #ffd35c; }
.photo-credit { position: absolute; right: 14px; bottom: 10px; font-size: 11px; color: rgba(255,255,255,.55); text-decoration: none; }
/* Candy-stripe band, red eyebrows. */
.promise { background: repeating-linear-gradient(135deg, #b3122e 0 46px, #c81d3a 46px 92px); }
.eyebrow { color: #b3122e; }
@media (hover: hover) { .service:hover { box-shadow: 0 22px 44px -28px rgba(120,10,30,.4); } }
dialog.lightbox::backdrop { background: rgba(5,12,20,.92); }
@media (max-width: 900px) {
  .hero::before { background: linear-gradient(180deg, rgba(5,14,24,.5) 0%, rgba(5,14,24,.3) 30%, rgba(5,14,24,.85) 64%, rgba(5,14,24,.95) 100%); }
}
`;

export function renderHoliday(d) {
  const stock = !d.heroImage;
  const html = renderLawn({
    ...d,
    ...(stock ? { heroImage: TREES, heroAlt: 'Snowy trees lit with warm Christmas lights at night', heroPosition: '50% 55%', heroPositionPhone: '82% 50%' } : {}),
    promise: d.promise ?? null,
    galleryTitle: d.galleryTitle ?? 'Homes we light up.',
    notePlaceholder: d.notePlaceholder ?? 'Roofline length, trees, a date you want them up…',
  });
  for (const must of ['</style>', '<section class="hero">', '<meta name="theme-color" content="#1d4a22">'])
    if (!html.includes(must)) throw new Error(`holiday kit: the lawn kit changed shape (${must})`);
  const credit = stock ? `<a class="photo-credit" href="${CREDIT_URL}" target="_blank" rel="noopener">${HOLIDAY_PHOTO_CREDIT}</a>` : '';
  return html
    .replace('</style>', `${CSS}</style>`)
    .replace('<section class="hero">', `<section class="hero">${credit}`)
    .replace('<meta name="theme-color" content="#1d4a22">', '<meta name="theme-color" content="#071225">');
}
