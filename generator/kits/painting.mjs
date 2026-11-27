// House painting: the lawn kit's layout (photo-led hero, services, gallery, reviews, quote form) in
// painter's colours: deep navy, warm gold, a clean off-white page. Their photos are shown as they are
// (the lawn kit's "greener grass" filter is off), and no mowing band.
//
// site.json fields: the same as the lawn kit (see kits/lawn.mjs).

import { renderLawn } from './lawn.mjs';

const CSS = `
/* House painting: navy and warm gold over the lawn layout. */
:root { --grass: #2f5d8a; --grass-hi: #6ea3d6; --grass-lo: #23476b; --stripe-a: #2f5784; --stripe-b: #294e77;
  --deep: #1b2a3a; --deeper: #121d29; --sun: #f2b33d; --mint: #e0e5eb;
  --bg: #ebe8e1; --panel: #f6f4ef; --ink: #1a2330; --muted: #58616d; --line: #dbd6cc; }
.photo { filter: none; }
.hero::before { background: linear-gradient(90deg, rgba(18,29,41,.9) 0%, rgba(18,29,41,.7) 40%, rgba(18,29,41,.1) 78%), linear-gradient(180deg, rgba(18,29,41,.55), transparent 30%); }
.hero h1 em, .hero .eyebrow { color: #ffe1a8; }
@media (hover: hover) { .service:hover { box-shadow: 0 22px 44px -28px rgba(27,42,58,.45); } }
dialog.lightbox::backdrop { background: rgba(12,19,28,.9); }
`;

export function renderPainting(d) {
  const html = renderLawn({
    ...d,
    promise: d.promise ?? null,
    galleryTitle: d.galleryTitle ?? 'Homes we’ve painted.',
    notePlaceholder: d.notePlaceholder ?? 'Inside or outside, how many rooms, a date you have in mind…',
  });
  if (!html.includes('</style>') || !html.includes('<meta name="theme-color" content="#1d4a22">')) throw new Error('painting kit: the lawn kit changed shape');
  return html.replace('</style>', `${CSS}</style>`).replace('<meta name="theme-color" content="#1d4a22">', '<meta name="theme-color" content="#1b2a3a">');
}
