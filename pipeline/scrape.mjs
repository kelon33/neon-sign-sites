// Reads a business's current website: its words, its pictures and its contact details.
// Nothing here judges or rewrites anything; that happens in photos.mjs and copy.mjs.

const PAGE_WORDS = /gallery|portfolio|our-work|work|photos|services|packages|pricing|prices|about|reviews|testimonials|contact/i;

/** Runs in the page: visible text, images (with hints), links and e-mail addresses. */
function readPage() {
  const imgs = [...document.images].map((img) => {
    const around = `${img.currentSrc} ${img.alt} ${img.className} ${img.parentElement?.className ?? ''} ${img.closest('a')?.className ?? ''}`;
    return {
      src: img.currentSrc || img.src,
      w: img.naturalWidth,
      h: img.naturalHeight,
      alt: img.alt ?? '',
      inHeader: !!img.closest('header, nav, [class*="header" i], [id*="header" i]'),
      logoHint: /logo|brand/i.test(around),
    };
  });
  // Photos set as backgrounds (common in page builders): size taken from the element they cover.
  for (const el of document.querySelectorAll('body *')) {
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === 'none') continue;
    const r = el.getBoundingClientRect();
    for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (m[1].startsWith('data:')) continue;
      imgs.push({ src: new URL(m[1], location.href).href, w: Math.round(r.width), h: Math.round(r.height), alt: '', inHeader: !!el.closest('header, nav'), logoHint: /logo/i.test(m[1]), bg: true });
    }
  }
  const og = document.querySelector('meta[property="og:image"]')?.content;
  if (og) imgs.push({ src: og, w: 0, h: 0, alt: '', inHeader: false, logoHint: false, og: true });
  const links = [...document.links].map((a) => ({ href: a.href, text: a.innerText.trim().slice(0, 60) }));
  const text = document.body.innerText;
  const emails = [...new Set([...text.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)].map((m) => m[0].toLowerCase())
    .concat(links.filter((l) => l.href.startsWith('mailto:')).map((l) => l.href.slice(7).split('?')[0].toLowerCase())))];
  return { title: document.title, text, imgs, links, emails };
}

export async function scrapeSite(browser, url, { maxPages = 5 } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  const pages = [];
  const visit = async (u) => {
    const page = await context.newPage();
    try {
      const resp = await page.goto(u, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null);
      // The HTML as their server sends it (before scripts run): a review a widget injects later is not in it.
      const raw = await resp?.text().catch(() => '') ?? '';
      await page.waitForTimeout(1500);
      // Scroll so lazy images load.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
      });
      await page.waitForTimeout(800);
      // A site that doesn't load shows the browser's own error page: nothing to build from.
      if (!page.url().startsWith('chrome-error:')) {
        const rendered = await page.content().catch(() => '');
        pages.push({ url: page.url(), raw: raw.slice(0, 600000), rendered: rendered.slice(0, 1500000), ...(await page.evaluate(readPage)) });
      }
    } catch { /* a page that fails is skipped */ }
    await page.close();
  };
  await visit(url);
  if (!pages.length) { await context.close(); return null; }
  const home = new URL(pages[0].url);
  const more = [...new Map(pages[0].links
    .filter((l) => { try { const u = new URL(l.href); return u.host === home.host && u.pathname !== home.pathname && PAGE_WORDS.test(u.pathname + ' ' + l.text); } catch { return false; } })
    .map((l) => [new URL(l.href).pathname, l.href])).values()].slice(0, maxPages - 1);
  for (const u of more) await visit(u);
  await context.close();
  return {
    url: pages[0].url,
    title: pages[0].title,
    pages: pages.map((p) => ({ url: p.url, text: p.text.slice(0, 12000), raw: p.raw, rendered: p.rendered })),
    imgs: pages.flatMap((p) => p.imgs),
    emails: [...new Set(pages.flatMap((p) => p.emails))].filter((e) => !/\.(png|jpe?g|webp|gif)$/.test(e) && !/sentry|wixpress|example\.com/.test(e)),
    links: pages.flatMap((p) => p.links),
  };
}
