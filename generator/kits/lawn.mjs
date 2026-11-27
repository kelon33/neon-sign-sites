// Lawn care and landscaping: bright and fresh, real grass greens, the business's own photos up
// front (a touch more colour so lawns look as green as they are), then services, a promise band
// with mowing stripes, the work (gallery), real reviews and a quote form.
//
// site.json fields (all optional except name, phone, services, steps):
//   heroImage, heroAlt, heroPosition, rating { score, count, url }, badges[],
//   highlights { title, intro, points[] }  (or "mobile", as the pipeline names it),
//   services[] { name, text, price? }, alsoTitle, also[], promise (HTML, <em> shines),
//   gallery[] { src, alt, size? }, reviews[] { text, name, note? }, why[], whyTitle,
//   areas[], areasTitle, hours[], email, logo, logoChip, wordmark { top, bottom }

import { esc, tel, previewTop, previewEnd } from '../shared.mjs';

const star = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z"/></svg>';
const stars = `<span class="stars" aria-label="5 stars">${star.repeat(5)}</span>`;
const icon = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const ICONS = [
  icon('<path d="M4 20c4-1 6-5 6-10M10 20c0-6 3-10 10-12M14 20c1-4 3-6 6-7"/>'),
  icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  icon('<path d="M12 3l8 3v6c0 4.6-3.4 8-8 9-4.6-1-8-4.4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  icon('<path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/>'),
];

export function renderLawn(d) {
  const preview = d.preview ? previewTop(d, esc) : '';
  const previewClose = d.preview ? previewEnd(d, esc) : '';
  const rating = d.rating ? `<a class="rating" href="${esc(d.rating.url)}" target="_blank" rel="noopener">${stars}<b>${esc(d.rating.score)}</b><span>${esc(d.rating.count)} Google reviews</span></a>` : '';
  const highlights = d.highlights ?? d.mobile;
  const wordmark = d.wordmark ?? { top: d.name, bottom: '' };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.title)}</title>
<meta name="description" content="${esc(d.description)}">
<meta name="theme-color" content="#1d4a22">
${d.preview ? '<meta name="robots" content="noindex, nofollow">' : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap">
<style>
/* Real grass greens, whatever the brand colour: lawns should look like lawns. */
:root { --grass: #4a9a3a; --grass-hi: #7cc85a; --grass-lo: #2f7428; --stripe-a: #4f9d3f; --stripe-b: #448d36;
  --deep: #163d1b; --deeper: #0f2c13; --sun: #f4c542; --mint: #e9f4df;
  --bg: #f7f8f1; --panel: #ffffff; --ink: #17240f; --muted: #5b6752; --line: #e1e6d3;
  --serif: "Fraunces", Georgia, serif; --sans: "Inter", system-ui, sans-serif; --ease: cubic-bezier(.22,.61,.36,1); }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 17px/1.65 var(--sans); -webkit-font-smoothing: antialiased; }
a { color: inherit; }
img { display: block; max-width: 100%; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
h1, h2, h3 { margin: 0; }
h1, h2 { font-family: var(--serif); font-weight: 600; letter-spacing: -0.02em; line-height: 1.03; }
h1 { font-size: clamp(2.7rem, 6.4vw, 5.2rem); }
h2 { font-size: clamp(2rem, 4vw, 3.2rem); }
h3 { font: 600 1.08rem/1.35 var(--sans); }
p { margin: 0; }
.eyebrow { font: 600 .74rem/1 var(--sans); letter-spacing: .2em; text-transform: uppercase; color: var(--grass-lo); margin-bottom: 18px; }
/* Their photos with a little more life: greens a touch greener, never fake. */
.photo { filter: saturate(1.18) contrast(1.04) brightness(1.02); }

/* Buttons: fresh-cut green with a soft sheen that sweeps across on hover or tap. */
.btn { position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: 17px 28px; border-radius: 999px; border: 0; cursor: pointer;
  font: 600 1rem/1 var(--sans); color: #fff; text-decoration: none; -webkit-tap-highlight-color: transparent; touch-action: manipulation;
  background: linear-gradient(180deg, var(--grass-hi), var(--grass) 50%, var(--grass-lo));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.45), inset 0 -1px 0 rgba(0,0,0,.18), 0 12px 28px -12px rgba(47,116,40,.85);
  transition: transform .3s var(--ease), box-shadow .3s var(--ease); }
.btn::after { content: ""; position: absolute; inset: -40% auto -40% -60%; width: 40%; transform: skewX(-20deg); pointer-events: none; left: -60%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.5), transparent); transition: left .7s var(--ease); }
.btn.light { background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.6); backdrop-filter: blur(6px); }
.btn.sun { background: linear-gradient(180deg, #ffe08a, var(--sun) 55%, #e2ad22); color: var(--deeper); box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 12px 28px -12px rgba(226,173,34,.9); }
@media (hover: hover) and (pointer: fine) {
  .btn:hover { transform: translateY(-1px); }
  .btn:hover::after { left: 130%; }
}
.btn.shine::after { left: 130%; }
.preview-bar { background: #0b0b10; color: #cfcbd6; font: 500 13px/1.4 var(--sans); text-align: center; padding: 9px 16px; }
.preview-bar a { color: #ff7aa8; }

/* Header, over the hero */
.top { position: absolute; left: 0; right: 0; z-index: 5; }
.top .wrap { display: flex; align-items: center; justify-content: space-between; gap: 20px; height: 96px; }
.logo { display: flex; align-items: center; gap: 12px; text-decoration: none; color: #fff; }
.logo img { height: 52px; width: auto; filter: drop-shadow(0 4px 14px rgba(0,0,0,.35)); }
.logo img.chip { background: #fff; border-radius: 12px; padding: 5px 8px; filter: none; }
.logo span { display: grid; line-height: 1; }
.logo b { font: 600 1.4rem/1 var(--serif); }
.logo small { font: 600 .64rem/1 var(--sans); letter-spacing: .28em; text-transform: uppercase; color: rgba(255,255,255,.75); margin-top: 7px; }
.top nav { display: flex; gap: 30px; }
.top nav a { color: rgba(255,255,255,.85); text-decoration: none; font-size: .95rem; }
.top nav a:hover { color: #fff; }
.top .btn { padding: 13px 22px; font-size: .93rem; }

/* Hero: their photo under a deep-green veil, or freshly mowed stripes when there is none. */
.hero { position: relative; color: #fff; min-height: min(100vh, 860px); display: flex; align-items: flex-end; padding: 170px 0 96px; overflow: hidden; isolation: isolate;
  background: radial-gradient(ellipse at 78% 0%, rgba(255,255,255,.18), transparent 55%), repeating-linear-gradient(100deg, var(--stripe-a) 0 120px, var(--stripe-b) 120px 240px); }
.hero > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: ${esc(d.heroPosition ?? '50% 60%')}; z-index: -2; transform: scale(1.04); animation: settle 2.4s var(--ease) forwards; }
.hero::before { content: ""; position: absolute; inset: 0; z-index: -1;
  background: ${d.heroImage
    ? 'linear-gradient(90deg, rgba(15,44,19,.9) 0%, rgba(15,44,19,.7) 40%, rgba(15,44,19,.1) 78%), linear-gradient(180deg, rgba(15,44,19,.55), transparent 30%)'
    : 'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(10,40,12,.42)), radial-gradient(ellipse at 20% 100%, rgba(0,0,0,.3), transparent 60%)'}; }
@keyframes settle { to { transform: scale(1); } }
.hero h1 { max-width: 12em; }
.hero h1 em { font-style: italic; color: #d9f5b5; }
.hero .eyebrow { color: #d9f5b5; }
.hero .lead { font-size: 1.16rem; color: rgba(255,255,255,.88); max-width: 32em; margin-top: 24px; }
.hero .actions { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 34px; }
.badges { display: flex; flex-wrap: wrap; gap: 10px 24px; margin-top: 30px; color: rgba(255,255,255,.9); font-size: .93rem; }
.badges span::before { content: "✓"; color: var(--sun); margin-right: 8px; font-weight: 700; }
.rating { display: inline-flex; align-items: center; gap: 10px; margin-top: 30px; text-decoration: none; padding: 10px 16px; border-radius: 999px; background: rgba(255,255,255,.14); box-shadow: inset 0 0 0 1px rgba(255,255,255,.25); backdrop-filter: blur(8px); font-size: .93rem; color: #fff; }
.rating b { font-weight: 600; }
.rating span { opacity: .85; }
.stars { display: inline-flex; gap: 2px; }
.stars svg { width: 16px; height: 16px; fill: #f4b51e; }

/* Sections */
.section { padding: 104px 0; }
.section.tint { background: var(--mint); }
.head { display: grid; grid-template-columns: 1.1fr .9fr; gap: 48px; align-items: end; margin-bottom: 50px; }
.head p { color: var(--muted); font-size: 1.07rem; }
.points { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.point { background: var(--panel); border: 1px solid var(--line); border-radius: 20px; padding: 28px 24px; }
.point svg, .why svg { width: 30px; height: 30px; fill: none; stroke: var(--grass); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; margin-bottom: 16px; }
.point p { color: var(--muted); font-size: .95rem; margin-top: 8px; }

.services { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.service { background: var(--panel); border: 1px solid var(--line); border-radius: 22px; padding: 30px 28px; position: relative; overflow: hidden; transition: transform .35s var(--ease), box-shadow .35s var(--ease); }
.service::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 5px; background: repeating-linear-gradient(100deg, var(--stripe-a) 0 22px, var(--stripe-b) 22px 44px); }
.service .n { font: 600 1.6rem/1 var(--serif); color: var(--grass); }
.service h3 { margin-top: 14px; font-size: 1.14rem; }
.service p { color: var(--muted); margin-top: 10px; font-size: .96rem; }
.service .price { margin-top: 16px; font: 600 1.3rem/1 var(--serif); color: var(--ink); }
.service .price small { font: 500 .8rem var(--sans); color: var(--muted); margin-right: 6px; }
@media (hover: hover) { .service:hover { transform: translateY(-4px); box-shadow: 0 22px 44px -28px rgba(23,61,27,.45); } }
.also { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; margin-top: 26px; color: var(--muted); }
.also .tag { color: var(--deep); background: var(--mint); border-radius: 999px; padding: 9px 16px; font-size: .93rem; font-weight: 500; }

/* A promise on a freshly mowed band */
.promise { color: #fff; padding: 96px 0; background: linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.25)), repeating-linear-gradient(100deg, var(--stripe-a) 0 120px, var(--stripe-b) 120px 240px); }
.promise p { font: 500 clamp(1.8rem, 3.6vw, 2.8rem)/1.22 var(--serif); max-width: 22em; text-shadow: 0 2px 20px rgba(0,0,0,.2); }
.promise em { color: #fff3c4; }

.gallery { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: 230px; gap: 12px; grid-auto-flow: dense; }
.gallery button { padding: 0; border: 0; border-radius: 18px; overflow: hidden; cursor: zoom-in; background: var(--mint); -webkit-tap-highlight-color: transparent; }
.gallery .big { grid-column: span 2; grid-row: span 2; }
.gallery .tall { grid-row: span 2; }
.gallery img { width: 100%; height: 100%; object-fit: cover; transition: transform .8s var(--ease); }
@media (hover: hover) { .gallery button:hover img { transform: scale(1.05); } }
dialog.lightbox { padding: 0; border: 0; background: transparent; max-width: min(94vw, 1100px); max-height: 92vh; }
dialog.lightbox::backdrop { background: rgba(8,22,10,.9); backdrop-filter: blur(6px); }
dialog.lightbox img { max-height: 88vh; width: auto; margin: auto; border-radius: 14px; }
dialog.lightbox form { position: absolute; top: 10px; right: 10px; }
dialog.lightbox form button { width: 44px; height: 44px; border-radius: 50%; border: 0; background: rgba(0,0,0,.55); color: #fff; font-size: 1.4rem; cursor: pointer; }

.reviews { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(300px, 1fr); gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 14px; }
.review { scroll-snap-align: start; margin: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 22px; padding: 28px; display: flex; flex-direction: column; gap: 16px; }
.review p { font-size: 1.02rem; flex: 1; }
.review cite { font-style: normal; font-weight: 600; font-size: .92rem; }
.review cite small { display: block; font-weight: 400; color: var(--muted); }
.section .rating { color: var(--ink); background: var(--panel); box-shadow: inset 0 0 0 1px var(--line); margin: 0; }

.why { display: grid; grid-template-columns: repeat(3, 1fr); gap: 34px; }
.why p { color: var(--muted); margin-top: 8px; font-size: .96rem; }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.step { border-top: 2px solid var(--grass); padding-top: 22px; }
.step .n { font: 600 2.3rem/1 var(--serif); color: var(--grass); }
.step h3 { margin-top: 12px; }
.step p { color: var(--muted); margin-top: 8px; font-size: .96rem; }

/* Quote */
.quote { background: radial-gradient(ellipse at 10% 0%, rgba(124,200,90,.25), transparent 55%), var(--deep); color: #fff; padding: 104px 0; }
.quote .grid { display: grid; grid-template-columns: .9fr 1.1fr; gap: 64px; }
.quote .eyebrow { color: #b9e59a; }
.quote dl { margin: 34px 0 0; display: grid; gap: 20px; }
.quote dt { font-size: .76rem; letter-spacing: .16em; text-transform: uppercase; color: rgba(255,255,255,.6); }
.quote dd { margin: 5px 0 0; font-size: 1.08rem; }
.quote dd a { text-decoration: none; }
.areas { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.areas span { background: rgba(255,255,255,.1); border-radius: 999px; padding: 6px 13px; font-size: .9rem; }
form.booking { background: #fff; color: var(--ink); border-radius: 26px; padding: 34px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; box-shadow: 0 40px 80px -40px rgba(0,0,0,.6); }
form.booking h3 { grid-column: 1 / -1; font: 600 1.7rem/1.1 var(--serif); margin-bottom: 4px; }
form.booking label { display: grid; gap: 7px; font-size: .86rem; color: var(--muted); }
form.booking .full { grid-column: 1 / -1; }
form.booking input, form.booking select, form.booking textarea { width: 100%; border: 1px solid var(--line); border-radius: 12px; padding: 14px; font: 400 1rem var(--sans); background: var(--bg); color: var(--ink); }
form.booking input:focus, form.booking select:focus, form.booking textarea:focus { outline: none; border-color: var(--grass); box-shadow: 0 0 0 3px rgba(74,154,58,.2); }
form.booking textarea { min-height: 90px; resize: vertical; }
form.booking .btn { grid-column: 1 / -1; margin-top: 6px; }
.footer { background: var(--deeper); color: rgba(255,255,255,.65); padding: 28px 0; font-size: .9rem; }
.footer .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; }

.dock { display: none; }
:focus-visible { outline: 2px solid var(--sun); outline-offset: 3px; }
@media (max-width: 900px) {
  .top nav, .top .btn { display: none; }
  .hero { min-height: 0; padding: 140px 0 70px; }
  .hero::before { background: linear-gradient(180deg, rgba(15,44,19,.55) 0%, rgba(15,44,19,.35) 30%, rgba(15,44,19,.88) 66%, rgba(15,44,19,.96) 100%); }
  .hero > img { object-position: ${esc(d.heroPositionPhone ?? d.heroPosition ?? '50% 50%')}; }
  .head, .quote .grid { grid-template-columns: 1fr; gap: 20px; }
  .points { grid-template-columns: 1fr 1fr; gap: 10px; }
  .point { padding: 22px 18px; }
  .services, .why, .steps { grid-template-columns: 1fr; }
  .gallery { grid-template-columns: 1fr 1fr; grid-auto-rows: 160px; gap: 8px; }
  .reviews { grid-auto-columns: 84%; }
  .section, .quote, .promise { padding: 78px 0; }
  form.booking { grid-template-columns: 1fr; padding: 24px; }
  .dock { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 20; padding: 8px; border-radius: 999px; background: rgba(255,255,255,.88); backdrop-filter: blur(14px); box-shadow: 0 14px 34px -12px rgba(15,44,19,.5); transition: transform .45s var(--ease), opacity .45s var(--ease); }
  .dock .btn { padding: 15px 10px; }
  .dock .btn.call { background: var(--mint); color: var(--deep); box-shadow: none; }
  .dock.away { transform: translateY(130%); opacity: 0; pointer-events: none; }
  body { padding-bottom: 86px; }
}
@media (max-width: 340px) { .points { grid-template-columns: 1fr; } }
@media (max-width: 520px) { .logo b { font-size: 1.15rem; } .logo img { height: 44px; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } .hero > img { transform: none; } }

/* RULE: the first screen reads as a whole page: headline, every hero button and the Google rating
   visible without scrolling, on laptops, desktops and phones (npm run fold checks it). */
:root:has(.preview-bar) { --bar: 36px; }
@media (max-width: 600px) { .pv-for { display: none; } }
.preview-bar { height: 36px; box-sizing: border-box; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (min-width: 901px) {
  .hero { min-height: calc(min(100vh, 860px) - var(--bar, 0px)); }
}
@media (min-width: 901px) and (max-height: 920px) {
  .hero { padding-top: 116px; padding-bottom: 52px; }
  .hero h1 { font-size: clamp(2.5rem, 8vh, 5.2rem); }
  .hero .lead { margin-top: 16px; }
  .hero .actions { margin-top: 24px; }
  .badges { margin-top: 18px; }
  .hero .rating { margin-top: 18px; }
}
@media (max-width: 900px) {
  .hero { min-height: calc(100svh - var(--bar, 0px)); padding: 96px 0 26px; }
  .hero h1 { font-size: clamp(1.9rem, min(10.2vw, 6svh), 3.3rem); }
  .hero .eyebrow { margin-bottom: 10px; }
  .hero .lead { font-size: 1rem; line-height: 1.5; margin-top: 12px; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
  .hero .actions { flex-wrap: nowrap; gap: 10px; margin-top: 18px; }
  .hero .actions .btn { flex: 1 1 0; min-width: 0; justify-content: center; text-align: center; padding: 14px 10px; font-size: .88rem; white-space: nowrap; }
  .badges { margin-top: 14px; gap: 6px 16px; font-size: .84rem; }
  .hero .rating { margin-top: 16px; }
}
@media (max-width: 900px) and (max-height: 760px) {
  .hero .lead { -webkit-line-clamp: 3; }
  .badges { display: none; }
}
</style>
</head>
<body>
${preview}
<header class="top">
  <div class="wrap">
    <a class="logo" href="#">${d.logo ? `<img src="${esc(d.logo)}" alt="${d.wordmark ? '' : esc(d.name)}"${d.logoChip ? ' class="chip"' : ''}>` : ''}${d.wordmark || !d.logo ? `<span><b>${esc(wordmark.top)}</b>${wordmark.bottom ? `<small>${esc(wordmark.bottom)}</small>` : ''}</span>` : ''}</a>
    <nav aria-label="Main"><a href="#services">Services</a>${d.gallery?.length ? '<a href="#work">Our work</a>' : ''}${d.reviews?.length ? '<a href="#reviews">Reviews</a>' : ''}<a href="#quote">Contact</a></nav>
    <a class="btn" href="#quote">Free quote</a>
  </div>
</header>

<main>
<section class="hero">
  ${d.heroImage ? `<img class="photo" src="${esc(d.heroImage)}" alt="${esc(d.heroAlt ?? '')}" fetchpriority="high">` : ''}
  <div class="wrap">
    <p class="eyebrow">${esc(d.kicker)}</p>
    <h1>${d.headline}</h1>
    <p class="lead">${esc(d.intro)}</p>
    <div class="actions">
      <a class="btn sun" href="#quote">Get a free quote</a>
      <a class="btn light" href="${tel(d.phone)}">Call ${esc(d.phone)}</a>
    </div>
    ${d.badges?.length ? `<div class="badges">${d.badges.map((b) => `<span>${esc(b)}</span>`).join('')}</div>` : ''}
    ${rating}
  </div>
</section>

${highlights?.points?.length ? `<section class="section" style="padding-bottom:40px">
  <div class="wrap">
    <div class="head"><div><p class="eyebrow">Why neighbors call us</p><h2>${esc(highlights.title)}</h2></div><p>${esc(highlights.intro)}</p></div>
    <div class="points">
      ${highlights.points.map((p, i) => `<div class="point">${ICONS[i % ICONS.length]}<h3>${esc(p.name)}</h3><p>${esc(p.text)}</p></div>`).join('\n      ')}
    </div>
  </div>
</section>` : ''}

<section class="section" id="services">
  <div class="wrap">
    <div class="head"><div><p class="eyebrow">Services</p><h2>${esc(d.servicesTitle)}</h2></div><p>${esc(d.servicesIntro)}</p></div>
    <div class="services">
      ${d.services.map((s, i) => `<article class="service"><span class="n">${String(i + 1).padStart(2, '0')}</span><h3>${esc(s.name)}</h3><p>${esc(s.text)}</p>${s.price ? `<p class="price"><small>from</small>${esc(s.price)}</p>` : ''}</article>`).join('\n      ')}
    </div>
    ${d.also?.length ? `<div class="also"><span>${esc(d.alsoTitle ?? 'We also do')}</span>${d.also.map((a) => `<span class="tag">${esc(a.name)}</span>`).join('')}</div>` : ''}
  </div>
</section>

${d.promise ? `<section class="promise"><div class="wrap"><p>${d.promise}</p></div></section>` : ''}

${d.gallery?.length ? `<section class="section" id="work">
  <div class="wrap">
    <div class="head"><div><p class="eyebrow">Our work</p><h2>${esc(d.galleryTitle ?? 'Yards we take care of.')}</h2></div><p>${esc(d.galleryIntro ?? '')}</p></div>
    <div class="gallery">
      ${d.gallery.map((g) => `<button type="button"${g.size ? ` class="${esc(g.size)}"` : ''} data-full="${esc(g.src)}" aria-label="View larger: ${esc(g.alt)}"><img class="photo" src="${esc(g.src)}" alt="${esc(g.alt)}" loading="lazy"></button>`).join('\n      ')}
    </div>
  </div>
  <dialog class="lightbox" aria-label="Photo"><form method="dialog"><button aria-label="Close">×</button></form><img class="photo" alt=""></dialog>
</section>` : ''}

${d.reviews?.length ? `<section class="section tint" id="reviews">
  <div class="wrap">
    <div class="head"><div><p class="eyebrow">Reviews</p><h2>${esc(d.reviewsTitle ?? 'What our customers say.')}</h2></div>${d.rating ? `<p><a class="rating" href="${esc(d.rating.url)}" target="_blank" rel="noopener">${stars}<b>${esc(d.rating.score)}</b><span>from ${esc(d.rating.count)} reviews on Google</span></a></p>` : ''}</div>
    <div class="reviews">
      ${d.reviews.map((r) => `<figure class="review">${stars}<p>“${esc(r.text)}”</p><cite>${esc(r.name)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</cite></figure>`).join('\n      ')}
    </div>
  </div>
</section>` : ''}

${d.why?.length ? `<section class="section">
  <div class="wrap">
    <p class="eyebrow">Why ${esc([wordmark.top, wordmark.bottom].filter(Boolean).join(' '))}</p>
    <h2 style="margin-bottom:46px;max-width:16em">${esc(d.whyTitle)}</h2>
    <div class="why">
      ${d.why.map((w, i) => `<div>${ICONS[(i + 2) % ICONS.length]}<h3>${esc(w.name)}</h3><p>${esc(w.text)}</p></div>`).join('\n      ')}
    </div>
  </div>
</section>` : ''}

<section class="section${d.why?.length ? ' tint' : ''}" id="how">
  <div class="wrap">
    <p class="eyebrow">How it works</p>
    <h2 style="margin-bottom:46px">${esc(d.howTitle)}</h2>
    <div class="steps">
      ${d.steps.map((s, i) => `<div class="step"><span class="n">0${i + 1}</span><h3>${esc(s.name)}</h3><p>${esc(s.text)}</p></div>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="quote" id="quote">
  <div class="wrap grid">
    <div>
      <p class="eyebrow">Free quote</p>
      <h2>${esc(d.contactTitle)}</h2>
      <dl>
        <div><dt>Call</dt><dd><a href="${tel(d.phone)}">${esc(d.phone)}</a></dd></div>
        ${d.email ? `<div><dt>Email</dt><dd><a href="mailto:${esc(d.email)}">${esc(d.email)}</a></dd></div>` : ''}
        ${d.address ? `<div><dt>Office</dt><dd>${esc(d.address)}</dd></div>` : ''}
        ${d.hours?.length ? `<div><dt>Hours</dt><dd>${d.hours.map(esc).join('<br>')}</dd></div>` : ''}
        ${d.areas?.length ? `<div><dt>${esc(d.areasTitle ? 'Service area' : 'Where we work')}</dt><dd><div class="areas">${d.areas.map((a) => `<span>${esc(a)}</span>`).join('')}</div></dd></div>` : ''}
      </dl>
    </div>
    <form class="booking" onsubmit="event.preventDefault(); this.querySelector('button').textContent='Thanks! We\\'ll be in touch.';">
      <h3>Get your free quote</h3>
      <label>Name <input name="name" autocomplete="name" required></label>
      <label>Phone <input name="phone" type="tel" autocomplete="tel" required></label>
      <label>Service <select name="service">${d.services.map((s) => `<option>${esc(s.name)}</option>`).join('')}<option>Not sure yet</option></select></label>
      <label>Property <select name="property"><option>Home</option><option>Business</option></select></label>
      <label class="full">Address or neighborhood <input name="address" autocomplete="street-address"></label>
      <label class="full">Anything we should know? <textarea name="note" placeholder="${esc(d.notePlaceholder ?? 'Yard size, how often, a date you have in mind…')}"></textarea></label>
      <button class="btn" type="submit">Request my free quote</button>
    </form>
  </div>
</section>
</main>

<footer class="footer"><div class="wrap"><span>© ${new Date().getFullYear()} ${esc(d.legalName ?? d.name)}</span><span>${esc(d.footerLine ?? '')}</span></div></footer>
<div class="dock away"><a class="btn call" href="${tel(d.phone)}">Call</a><a class="btn" href="#quote">Free quote</a></div>
<script>
  const box = document.querySelector('dialog.lightbox');
  if (box) for (const b of document.querySelectorAll('.gallery button')) b.addEventListener('click', () => { box.querySelector('img').src = b.dataset.full; box.querySelector('img').alt = b.querySelector('img').alt; box.showModal(); });
  box?.addEventListener('click', (e) => { if (e.target === box) box.close(); });
  const dock = document.querySelector('.dock'), heroActions = document.querySelector('.hero .actions');
  new IntersectionObserver(([e]) => dock.classList.toggle('away', e.isIntersecting)).observe(heroActions);
  for (const b of document.querySelectorAll('.btn')) b.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    b.classList.remove('shine'); void b.offsetWidth; b.classList.add('shine');
    clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('shine'), 800);
  });
</script>
${previewClose}
</body>
</html>
`;
}
