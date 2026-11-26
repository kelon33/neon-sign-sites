// The business's own photos and logo: which images are real work photos, which one is the logo,
// and sharp, light copies of them for the new site. Resizing runs in the browser (canvas), so
// the pipeline needs no image library.

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const NOT_A_PHOTO = /logo|icon|avatar|user|person|people|placeholder|badge|award|google|yelp|facebook|instagram|stars?[-_.]|review|sprite|emoji|loader|spinner|arrow|banner-ad|map/i;

/** The same image at several sizes (WordPress "-300x225", "-scaled") counts once. */
export function imageKey(src) {
  try {
    const u = new URL(src);
    return path.basename(u.pathname).toLowerCase().replace(/-\d+x\d+(?=\.\w+$)/, '').replace(/-(scaled|min|e\d+)(?=\.\w+$)/, '');
  } catch { return src; }
}

/** Real photos only, largest copy of each, in page order. */
export function photoCandidates(imgs) {
  const best = new Map();
  for (const img of imgs) {
    if (!img.src || img.src.startsWith('data:') || /\.(svg|gif)(\?|$)/i.test(img.src)) continue;
    if (img.logoHint || NOT_A_PHOTO.test(img.src) || NOT_A_PHOTO.test(img.alt ?? '')) continue;
    const big = Math.max(img.w, img.h), small = Math.min(img.w, img.h);
    if (!img.og && (big < 700 || small < 450)) continue;
    const key = imageKey(img.src);
    const had = best.get(key);
    if (!had || img.w * img.h > had.w * had.h) best.set(key, img);
  }
  return [...best.values()];
}

/** The logo: an image marked as one in the header, else any image marked as one. */
export function logoCandidate(imgs) {
  const marked = imgs.filter((i) => i.logoHint && i.src && !i.src.startsWith('data:') && i.w >= 60);
  const pick = (list) => list.sort((a, b) => b.w * b.h - a.w * a.h)[0];
  return pick(marked.filter((i) => i.inHeader)) ?? pick(marked) ?? null;
}

/**
 * How many photos the gallery shows, so the grid has no holes: one big photo (2×2) plus,
 * when used, one tall photo (1×2) and the rest single cells, in 4 columns (2 on a phone).
 */
export function galleryPlan(count) {
  for (const n of [12, 9, 8, 5, 4]) if (count >= n) return { count: n, tall: n % 2 === 0 };
  return { count: 0, tall: false };
}

/** Runs in the browser: resize to fit `max`, JPEG; or for a logo, crop transparent edges and keep PNG. */
async function shrinkInPage({ dataUrl, max, logo }) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  let { naturalWidth: w, naturalHeight: h } = img;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = w; canvas.height = h;
  ctx.drawImage(img, 0, 0);
  let sx = 0, sy = 0, sw = w, sh = h, transparent = false, dark = false, bright = 0;
  if (!logo) {
    // Average brightness of a small copy: dark interior shots make a poor hero.
    const t = document.createElement('canvas'); t.width = 32; t.height = 32;
    const tc = t.getContext('2d'); tc.drawImage(img, 0, 0, 32, 32);
    const px = tc.getImageData(0, 0, 32, 32).data;
    for (let i = 0; i < px.length; i += 4) bright += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    bright = Math.round(bright / 1024);
  }
  if (logo) {
    const data = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1, lum = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 200) { transparent = true; if (data[i + 3] < 20) continue; }
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      lum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; n++;
    }
    if (x1 >= 0) { sx = x0; sy = y0; sw = x1 - x0 + 1; sh = y1 - y0 + 1; }
    dark = n > 0 && lum / n < 90;
  }
  const scale = Math.min(1, max / Math.max(sw, sh));
  const out = document.createElement('canvas');
  out.width = Math.round(sw * scale); out.height = Math.round(sh * scale);
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return {
    data: out.toDataURL(logo ? 'image/png' : 'image/jpeg', 0.82),
    w: out.width, h: out.height, transparent, dark, bright,
  };
}

/** Downloads one image and saves a resized copy. Returns its size and logo hints, or null. */
export async function saveImage(page, src, file, { max = 1200, logo = false } = {}) {
  // Load it through the browser itself (it uses the network settings and proxy a plain
  // download would skip), then read the bytes it received.
  const res = await page.goto(src, { timeout: 30000 }).catch(() => null);
  if (!res?.ok()) return null;
  const type = res.headers()['content-type'] ?? 'image/jpeg';
  if (!type.startsWith('image/') || type.includes('svg')) return null;
  const dataUrl = `data:${type};base64,${(await res.body()).toString('base64')}`;
  const out = await page.evaluate(shrinkInPage, { dataUrl, max, logo }).catch(() => null);
  if (!out) return null;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(out.data.split(',')[1], 'base64'));
  return { w: out.w, h: out.h, transparent: out.transparent, dark: out.dark, bright: out.bright };
}

/** A small preview of a saved photo, for the AI to look at (cheap: 384px). */
export async function thumbnail(page, file) {
  const { readFile } = await import('node:fs/promises');
  const dataUrl = `data:image/jpeg;base64,${(await readFile(file)).toString('base64')}`;
  const out = await page.evaluate(shrinkInPage, { dataUrl, max: 384, logo: false });
  return out.data.split(',')[1];
}

/** The hero: a bright landscape photo if there is one, else the brightest photo (cropped). */
export function pickHero(photos) {
  if (!photos.length) return -1;
  const score = (p) => (p.w > p.h ? 1000 : 0) + Math.min(p.bright ?? 0, 150);
  return photos.reduce((best, p, i) => (score(p) > score(photos[best]) ? i : best), 0);
}
