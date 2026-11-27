// Licensed real photos for the hero of a preview whose business has no usable photo of its own
// (see assets/CREDITS.md). Never presented as their work: each is credited on the page, and the
// pipeline notes it in check.txt. The holiday kit handles its own (kits/holiday.mjs).

import { readFileSync } from 'node:fs';

const asset = (f) => `data:image/jpeg;base64,${readFileSync(new URL(`./assets/${f}`, import.meta.url)).toString('base64')}`;
const lazy = (f) => { let v; return () => (v ??= asset(f)); };

export const STOCK = {
  boat: { src: lazy('boat.jpg'), alt: 'A glossy motorboat moored in a marina', pos: '50% 55%', phone: '45% 50%', credit: 'Photo: Nicola Romani', url: "https://commons.wikimedia.org/wiki/File:Magnum_44%27_a_Fano_-_1.jpg" },
  detailing: { src: lazy('detailing.jpg'), alt: 'A glossy classic car at sunset', pos: '55% 60%', phone: '50% 55%', credit: 'Photo: Dietmar Rabich, CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:D%C3%BClmen,_Merfeld,_Volvo_PV_544_B18_--_2021_--_0075-9.jpg' },
  painting: { src: lazy('painting.jpg'), alt: 'A house painter on a ladder painting a front', pos: '60% 45%', phone: '62% 50%', credit: 'Photo: FaceMePLS, CC BY 2.0', url: 'https://commons.wikimedia.org/wiki/File:ZZP_Groep_Leiden_(14490283179).jpg' },
  lawn: { src: lazy('lawn.jpg'), alt: 'A lawn mower on freshly cut grass', pos: '50% 60%', phone: '68% 60%', credit: 'Photo: rawpixel, CC0', url: 'https://www.rawpixel.com/image/6035733/lawn-mower-free-public-domain-cc0-photo' },
};

/** Which stock photo fits a preview: by its trade, else its kit. */
export function stockKey(d) {
  const t = `${d.trade ?? ''} ${d.kicker ?? ''}`.toLowerCase();
  if (/boat|marine/.test(t)) return 'boat';
  if (/dent|detail/.test(t) || d.kit === 'detailing') return 'detailing';
  if (/paint/.test(t) || d.kit === 'painting') return 'painting';
  if (d.kit === 'lawn' || !d.kit) return 'lawn';
  return null;
}

/** The data with a stock hero when it has none of its own, and the credit link to put in the hero. */
export function withStockHero(d) {
  if (d.heroImage || d.kit === 'holiday' || d.noStockHero) return { d, credit: '' };
  const s = STOCK[stockKey(d)];
  if (!s) return { d, credit: '' };
  return {
    d: { ...d, heroImage: s.src(), heroAlt: s.alt, heroPosition: s.pos, heroPositionPhone: s.phone },
    credit: `<a class="photo-credit" href="${s.url}" target="_blank" rel="noopener">${s.credit}</a>`,
  };
}

export const CREDIT_CSS = '.photo-credit { position: absolute; right: 14px; bottom: 10px; z-index: 2; font-size: 11px; color: rgba(255,255,255,.55); text-decoration: none; }';
