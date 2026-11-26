// Lawn care and landscaping: a freshly mowed, striped hero in the brand's greens.

import { esc, tel, shade } from '../shared.mjs';

export function renderLawn(d) {
  const brand = d.brand ?? '#2f5d3a';
  const brandDark = shade(brand, -0.45);
  const stripeA = shade(brand, -0.18);
  const stripeB = shade(brand, -0.30);
  const brandDeep = shade(brand, -0.7);
  const brandLight = shade(brand, 0.86);
  const accent = d.accent ?? '#e8c872';
  const preview = d.preview ? `<div class="preview-bar">Preview prepared for ${esc(d.name)} by <a href="https://neonsignsites.com/">Neon Sign Sites</a>. Not the live site.</div>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.title)}</title>
<meta name="description" content="${esc(d.description)}">
${d.preview ? '<meta name="robots" content="noindex, nofollow">' : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Inter:wght@400;500;600&display=swap">
<style>
:root { --brand: ${brand}; --brand-dark: ${brandDark}; --brand-deep: ${brandDeep}; --brand-light: ${brandLight}; --accent: ${accent}; --stripe-a: ${stripeA}; --stripe-b: ${stripeB};
  --ink: #1a1d16; --muted: #5d6356; --paper: #faf8f2; --line: #e5e1d4; --serif: "Fraunces", Georgia, serif; --sans: "Inter", system-ui, sans-serif; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 400 17px/1.65 var(--sans); -webkit-font-smoothing: antialiased; }
a { color: inherit; }
.wrap { max-width: 1140px; margin: 0 auto; padding: 0 24px; }
h1, h2, h3 { margin: 0; font-weight: 400; }
h1, h2 { font-family: var(--serif); letter-spacing: -0.015em; line-height: 1.04; }
h1 { font-size: clamp(2.7rem, 6vw, 4.9rem); }
h2 { font-size: clamp(2rem, 4vw, 3.1rem); }
h3 { font: 600 1.08rem/1.35 var(--sans); }
p { margin: 0; }
.eyebrow { font: 600 0.76rem/1 var(--sans); letter-spacing: 0.16em; text-transform: uppercase; color: var(--brand); margin-bottom: 16px; }
.btn { display: inline-flex; align-items: center; gap: 10px; background: var(--accent); color: var(--brand-deep); font: 600 1rem/1 var(--sans); padding: 17px 26px; border-radius: 999px; text-decoration: none; border: 0; cursor: pointer; transition: transform .15s ease; }
.btn:hover { transform: translateY(-1px); }
.btn.ghost { background: transparent; color: #fff; box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.55); }
.preview-bar { background: #0b0b10; color: #cfcbd6; font: 500 13px/1.4 var(--sans); text-align: center; padding: 9px 16px; }
.preview-bar a { color: #ff7aa8; }

/* Header */
.top { position: absolute; left: 0; right: 0; z-index: 5; }
.top .wrap { display: flex; align-items: center; justify-content: space-between; gap: 20px; height: 92px; }
.logo img { height: 58px; width: auto; display: block; }
.top nav { display: flex; gap: 30px; }
.top nav a { color: rgba(255,255,255,.82); text-decoration: none; font-size: .95rem; }
.top nav a:hover { color: #fff; }
.call { color: #fff; text-decoration: none; font-weight: 600; white-space: nowrap; }

/* Hero: a freshly mowed lawn, in the brand's greens. */
.hero { position: relative; color: #fff; padding: 190px 0 120px; overflow: hidden;
  background:
    radial-gradient(ellipse at 78% 0%, rgba(255,255,255,.14), transparent 55%),
    linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,.38)),
    repeating-linear-gradient(100deg, var(--stripe-a) 0 120px, var(--stripe-b) 120px 240px); }
.hero::after { content: ""; position: absolute; inset: 0; background: radial-gradient(ellipse at 20% 100%, rgba(0,0,0,.35), transparent 60%); pointer-events: none; }
.hero .wrap { position: relative; z-index: 1; }
.hero .eyebrow { color: var(--accent); }
.hero p.lead { font-size: 1.18rem; color: rgba(255,255,255,.86); max-width: 33em; margin-top: 22px; }
.hero .actions { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 36px; }
.badges { display: flex; flex-wrap: wrap; gap: 10px 26px; margin-top: 44px; color: rgba(255,255,255,.85); font-size: .92rem; }
.badges span::before { content: "✓"; color: var(--accent); margin-right: 8px; }

/* Sections */
.section { padding: 110px 0; }
.section.tint { background: #fff; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.head { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: end; margin-bottom: 54px; }
.head p { color: var(--muted); font-size: 1.08rem; }
.services { display: grid; grid-template-columns: repeat(auto-fit, minmax(196px, 1fr)); gap: 16px; }
.service { background: #fff; border: 1px solid var(--line); border-radius: 20px; padding: 30px 26px; transition: transform .2s ease, box-shadow .2s ease; }
.section.tint .service { background: var(--paper); }
.service:hover { transform: translateY(-3px); box-shadow: 0 18px 40px -24px rgba(0,0,0,.25); }
.service .mark { width: 42px; height: 42px; border-radius: 12px; background: var(--brand-light); display: grid; place-items: center; color: var(--brand-dark); font: 500 1.2rem var(--serif); margin-bottom: 20px; }
.service p { color: var(--muted); margin-top: 10px; font-size: .97rem; }

.quote-line { font: 400 clamp(1.8rem, 3.6vw, 2.8rem)/1.2 var(--serif); max-width: 22em; }
.quote-line em { color: var(--brand); }

.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.step { border-top: 2px solid var(--brand); padding-top: 22px; }
.step .n { font: 400 2.4rem/1 var(--serif); color: var(--brand); }
.step h3 { margin-top: 14px; }
.step p { color: var(--muted); margin-top: 8px; font-size: .97rem; }

.areas { display: flex; flex-wrap: wrap; gap: 10px; }
.areas span { background: var(--brand-light); color: var(--brand-deep); border-radius: 999px; padding: 10px 18px; font-weight: 500; }

/* Contact */
.contact { background: var(--brand-deep); color: #fff; padding: 110px 0; }
.contact .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; }
.contact .eyebrow { color: var(--accent); }
.contact dl { margin: 34px 0 0; display: grid; gap: 18px; }
.contact dt { font-size: .8rem; letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,.6); }
.contact dd { margin: 4px 0 0; font-size: 1.1rem; }
.contact dd a { text-decoration: none; }
.hours { font-size: .95rem; color: rgba(255,255,255,.82); }
form { background: #fff; color: var(--ink); border-radius: 24px; padding: 34px; display: grid; gap: 14px; }
form h3 { font: 400 1.7rem/1.1 var(--serif); }
form label { display: grid; gap: 6px; font-size: .88rem; color: var(--muted); }
form input, form select, form textarea { border: 1px solid var(--line); border-radius: 12px; padding: 13px 14px; font: 400 1rem var(--sans); background: var(--paper); color: var(--ink); }
form textarea { min-height: 96px; resize: vertical; }
form .btn { justify-content: center; background: var(--brand); color: #fff; margin-top: 6px; }
.footer { background: var(--brand-deep); border-top: 1px solid rgba(255,255,255,.12); color: rgba(255,255,255,.65); padding: 28px 0; font-size: .9rem; }
.footer .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; }

/* Phone: a call button always in reach */
.sticky-call { display: none; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 6px; }
@media (max-width: 860px) {
  .top nav { display: none; }
  .hero { padding: 150px 0 90px; }
  .head, .contact .grid { grid-template-columns: 1fr; gap: 22px; }
  .steps { grid-template-columns: 1fr; }
  .section, .contact { padding: 80px 0; }
  .sticky-call { display: flex; position: fixed; left: 14px; right: 14px; bottom: 14px; z-index: 20; justify-content: center; box-shadow: 0 12px 30px -10px rgba(0,0,0,.45); }
  body { padding-bottom: 80px; }
}
</style>
</head>
<body>
${preview}
<header class="top">
  <div class="wrap">
    <a class="logo" href="#"><img src="${esc(d.logo)}" alt="${esc(d.name)}"></a>
    <nav aria-label="Main"><a href="#services">Services</a><a href="#how">How it works</a><a href="#areas">Service area</a><a href="#contact">Contact</a></nav>
    <a class="call" href="${tel(d.phone)}">${esc(d.phone)}</a>
  </div>
</header>

<main>
<section class="hero">
  <div class="wrap">
    <p class="eyebrow">${esc(d.kicker)}</p>
    <h1>${d.headline}</h1>
    <p class="lead">${esc(d.intro)}</p>
    <div class="actions">
      <a class="btn" href="#contact">Get a free quote</a>
      <a class="btn ghost" href="${tel(d.phone)}">Call ${esc(d.phone)}</a>
    </div>
    <div class="badges">${(d.badges ?? []).map((b) => `<span>${esc(b)}</span>`).join('')}</div>
  </div>
</section>

<section class="section" id="services">
  <div class="wrap">
    <div class="head">
      <div><p class="eyebrow">Services</p><h2>${esc(d.servicesTitle)}</h2></div>
      <p>${esc(d.servicesIntro)}</p>
    </div>
    <div class="services">
      ${d.services.map((s, i) => `<article class="service"><div class="mark">${String(i + 1).padStart(2, '0')}</div><h3>${esc(s.name)}</h3><p>${esc(s.text)}</p></article>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="section tint">
  <div class="wrap"><p class="quote-line">${d.promise}</p></div>
</section>

<section class="section" id="how">
  <div class="wrap">
    <p class="eyebrow">How it works</p>
    <h2 style="margin-bottom:48px">${esc(d.howTitle)}</h2>
    <div class="steps">
      ${d.steps.map((s, i) => `<div class="step"><span class="n">0${i + 1}</span><h3>${esc(s.name)}</h3><p>${esc(s.text)}</p></div>`).join('\n      ')}
    </div>
  </div>
</section>

<section class="section tint" id="areas">
  <div class="wrap">
    <div class="head">
      <div><p class="eyebrow">Service area</p><h2>${esc(d.areasTitle)}</h2></div>
      <p>${esc(d.areasIntro)}</p>
    </div>
    <div class="areas">${d.areas.map((a) => `<span>${esc(a)}</span>`).join('')}</div>
  </div>
</section>

<section class="contact" id="contact">
  <div class="wrap grid">
    <div>
      <p class="eyebrow">Contact</p>
      <h2>${esc(d.contactTitle)}</h2>
      <dl>
        <div><dt>Call</dt><dd><a href="${tel(d.phone)}">${esc(d.phone)}</a></dd></div>
        <div><dt>Email</dt><dd><a href="mailto:${esc(d.email)}">${esc(d.email)}</a></dd></div>
        <div><dt>Office</dt><dd>${esc(d.address)}</dd></div>
        <div><dt>Hours</dt><dd class="hours">${(d.hours ?? []).map(esc).join('<br>')}</dd></div>
      </dl>
    </div>
    <form onsubmit="event.preventDefault(); this.querySelector('button').textContent='Thanks! We\\'ll be in touch.';">
      <h3>Get your free quote</h3>
      <label>Name <input name="name" autocomplete="name" required></label>
      <label>Phone <input name="phone" type="tel" autocomplete="tel" required></label>
      <label>Service <select name="service">${d.services.map((s) => `<option>${esc(s.name)}</option>`).join('')}</select></label>
      <label>Address or neighborhood <input name="address" autocomplete="street-address"></label>
      <label>Anything we should know? <textarea name="note"></textarea></label>
      <button class="btn" type="submit">Request my quote</button>
    </form>
  </div>
</section>
</main>

<footer class="footer"><div class="wrap"><span>© ${new Date().getFullYear()} ${esc(d.legalName ?? d.name)}</span><span>${esc(d.footerLine ?? '')}</span></div></footer>
<a class="btn sticky-call" href="${tel(d.phone)}">Call ${esc(d.phone)}</a>
</body>
</html>
`;
}

