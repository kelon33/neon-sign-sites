// The words on the new site. Two layers:
//   1. kitCopy(): ready-made wording for the trade, filled in with the business's facts. Free, always works.
//   2. sharpen(): Claude (config.json "aiModel", Sonnet 5.5 by default) rewrites it from the
//      business's own site and picks the photos. A few cents a lead. Used when ANTHROPIC_API_KEY (or NEON_ANTHROPIC_API_KEY) is set; anything it says that can't be
//      traced back to the business's own words is dropped (see verify()).

// Detailing services we recognise on a site, with plain descriptions of what each service is.
export const DETAILING_SERVICES = [
  [/full detail|premium detail|complete detail|interior\s*(?:&|and|\/)\s*exterior|exterior\s*(?:&|and|\/)\s*interior/i, 'Interior & exterior detailing', 'A complete detail, top to bottom: wash, wheels, glass, vacuum and wipe-down.'],
  [/interior detail|interior clean|deep clean/i, 'Interior detailing', 'Seats, carpets, dash and every crevice, vacuumed, cleaned and dressed.'],
  [/exterior detail|hand wash|exterior wash/i, 'Exterior detailing', 'A careful hand wash, wheels and tires, glass and a protective finish.'],
  [/paint correction|swirl|polish(?!ing machine)/i, 'Paint correction & polish', 'Machine polishing that takes out swirls, scratches and oxidation.'],
  [/ceramic/i, 'Ceramic coating', 'A hard, glossy layer that protects your paint and makes every wash easier.'],
  [/\bwax|sealant|clay/i, 'Wax, clay & sealant', 'Clay to lift bonded grime, then wax or sealant for a deep, slick shine.'],
  [/shampoo|upholstery|carpet|stain/i, 'Seat & carpet shampoo', 'Stains, spills and odors lifted out of seats, carpets and mats.'],
  [/headlight/i, 'Headlight restoration', 'Cloudy, yellowed headlights made clear again.'],
  [/odor|ozone|smoke/i, 'Odor removal', 'Smoke, pet and food smells removed, not covered up.'],
  [/engine bay|engine clean/i, 'Engine bay cleaning', 'A careful clean and dress under the hood.'],
  [/pet hair/i, 'Pet hair removal', 'Every last pet hair out of seats and carpets.'],
];
const ALSO = [[/boat|marine/i, 'Boats'], [/\brv\b|motorhome|camper/i, 'RVs'], [/motorcycle|motorbike/i, 'Motorcycles'], [/fleet/i, 'Fleets']];

// Lawn and landscaping services we recognise on a site.
export const LAWN_SERVICES = [
  [/mow/i, 'Lawn mowing', 'Precision mowing on a regular schedule, with clippings blown off walks and drives.'],
  [/edg|trim/i, 'Edging & trimming', 'Crisp edges along every walk, drive and bed, and trimming where the mower can\'t reach.'],
  [/mulch/i, 'Mulching', 'Fresh mulch that keeps beds neat, holds moisture and blocks weeds.'],
  [/hedge|shrub|bush/i, 'Hedge & shrub trimming', 'Hedges and shrubs shaped clean and kept in check.'],
  [/leaf|clean[- ]?up|debris/i, 'Yard cleanups', 'Leaves, branches and storm debris cleared and hauled away.'],
  [/sod/i, 'Sod installation', 'New sod laid level and tight, for a lawn that looks finished on day one.'],
  [/irrigation|sprinkler/i, 'Irrigation & sprinklers', 'Sprinkler systems installed, adjusted and repaired.'],
  [/landscap/i, 'Landscaping', 'New beds, plants and stone, designed for your yard and the local climate.'],
  [/fertiliz|weed control|weed/i, 'Fertilizing & weed control', 'Feeding and weed treatments that keep grass thick and green.'],
  [/aerat/i, 'Aeration', 'Core aeration that lets water and air reach the roots.'],
  [/tree/i, 'Tree trimming', 'Low limbs and overgrowth trimmed back safely.'],
  [/pressure wash|power wash/i, 'Pressure washing', 'Drives, walks and patios washed clean.'],
];

export function kitFor(trade) {
  if (/detail|car wash|auto spa|dent repair/i.test(trade ?? '')) return 'detailing';
  if (/christmas light|holiday light/i.test(trade ?? '')) return 'holiday';
  if (/lawn|landscap|yard|mow/i.test(trade ?? '')) return 'lawn';
  if (/house paint|painter|painting/i.test(trade ?? '')) return 'painting';
  return null;
}

// Trades that borrow a kit: their own default wording, so a dent-repair preview never says "pet hair"
// and a Christmas-light preview never says "We don't just mow". Defaults only: the AI rewrites most of
// it from their site, and these make no claims.
const TRADE_WORDS = [
  [/dent repair/i, (town) => ({
    kicker: `Paintless dent repair · ${town}`,
    headline: 'Dents out.<br><em>Paint untouched.</em>',
    intro: `Paintless dent repair in ${town}: door dings, creases and hail damage pushed out from behind, so the factory paint stays.`,
    servicesTitle: 'Every kind of dent.', servicesIntro: 'From a single door ding to a hail-covered roof.',
    services: [
      { name: 'Door dings', text: 'Small parking-lot dents pushed out without paint or filler.' },
      { name: 'Hail damage', text: 'Roofs, hoods and trunks restored after a storm.' },
      { name: 'Creases and larger dents', text: 'Worked out from behind the panel where the metal allows.' },
    ],
    alsoTitle: 'We also fix', galleryTitle: 'Dents gone, paint untouched.',
    howTitle: 'Dent-free in three steps.',
    steps: [
      { name: 'Send a photo', text: 'Call, text or use the form with a photo of the dent.' },
      { name: 'Get a price', text: 'We look at the damage and tell you what it takes.' },
      { name: 'Drive it smooth', text: 'We work the dent out and hand the car back.' },
    ],
    contactTitle: 'Got a dent?', footerLine: `Paintless dent repair in ${town}`,
    notePlaceholder: 'Where the dent is, how big, hail or a door ding…', ctaLabel: 'Get an estimate',
  })],
  [/boat detail|marine detail/i, (town) => ({
    kicker: `Boat detailing · ${town}`,
    headline: 'Back on the water<br><em>looking new.</em>',
    intro: `Boat detailing in ${town}: hulls, decks and interiors cleaned, polished and protected.`,
    servicesTitle: 'Bow to stern.', servicesIntro: 'From a wash and wax to bringing back faded gelcoat.',
    services: [
      { name: 'Wash and wax', text: 'Hull and deck washed, then waxed for shine and protection.' },
      { name: 'Oxidation removal', text: 'Chalky, faded gelcoat compounded and polished back.' },
      { name: 'Interior and upholstery', text: 'Seats, carpet and vinyl cleaned and treated.' },
    ],
    alsoTitle: 'We also detail', galleryTitle: 'Fresh off the water.',
    howTitle: 'Ready for the water in three steps.',
    steps: [
      { name: 'Tell us about your boat', text: 'Call, text or use the form with its size and where it is.' },
      { name: 'We come to it', text: 'At the dock, the ramp or your driveway.' },
      { name: 'Back on the water', text: 'Clean, polished and protected.' },
    ],
    contactTitle: 'Book your boat in.', footerLine: `Boat detailing in ${town}`,
    vehicleTypes: ['Boat', 'Pontoon', 'Yacht', 'Jet ski', 'Other'], modelPlaceholder: 'e.g. Sea Ray 240, 24 ft',
    notePlaceholder: 'Length, where it is docked or stored, what it needs…',
  })],
  [/house paint|painter|painting/i, (town) => ({
    kicker: `House painting · ${town}`,
    headline: 'Fresh paint.<br><em>Clean lines.</em>',
    intro: `Interior and exterior house painting in ${town}: walls, trim, cabinets and siding.`,
    servicesTitle: 'Inside and out.', servicesIntro: 'One room or the whole house.',
    services: [
      { name: 'Interior painting', text: 'Walls, ceilings and trim in the colors you choose.' },
      { name: 'Exterior painting', text: 'Siding, trim and doors, prepped and painted.' },
      { name: 'Cabinets and trim', text: 'Kitchen cabinets, doors and woodwork refreshed.' },
    ],
    promise: null, galleryTitle: 'Homes we\u2019ve painted.',
    howTitle: 'A fresh coat in three steps.',
    steps: [
      { name: 'Ask for a quote', text: 'Tell us about the job by phone or with the form below.' },
      { name: 'Pick your colors', text: 'We look at the job and go over colors and timing with you.' },
      { name: 'Enjoy the new look', text: 'We paint. You enjoy a fresh-looking home.' },
    ],
    contactTitle: 'Ready for a fresh coat?', footerLine: `House painting in ${town}`,
    notePlaceholder: 'Inside or outside, how many rooms, a date you have in mind…',
  })],
  [/christmas light|holiday light/i, (town) => ({
    kicker: `Christmas light installation · ${town}`,
    headline: 'Your house,<br><em>lit up right.</em>',
    intro: `Christmas and holiday lights in ${town}, hung straight and safely, so you don't have to climb a ladder.`,
    badges: [], servicesTitle: 'Lights, done for you.', servicesIntro: 'Rooflines, trees and everything in between.',
    services: [
      { name: 'Roofline lighting', text: 'Clean, straight lines along the roof and gutters.' },
      { name: 'Trees and bushes', text: 'Trunks, branches and shrubs wrapped in light.' },
      { name: 'Custom designs', text: 'A look planned around your house.' },
    ],
    promise: null, galleryTitle: 'Homes we light up.',
    howTitle: 'Lit up in three steps.',
    steps: [
      { name: 'Ask for a quote', text: 'Tell us about your house by phone or with the form below.' },
      { name: 'Pick your design', text: 'Choose the lights and where they go.' },
      { name: 'Flip the switch', text: 'We hang them. You enjoy the season.' },
    ],
    contactTitle: 'Ready to light it up?', footerLine: `Christmas light installation in ${town}`,
    notePlaceholder: 'Roofline length, trees, a date you want them up…',
  })],
];

/** The kit wording, with a borrowing trade's own defaults on top. */
export function tradeCopy(trade, copy, city) {
  const town = city?.replace(/,\s*[A-Z]{2}$/, '') ?? '';
  const own = TRADE_WORDS.find(([re]) => re.test(trade ?? ''));
  return own ? { ...copy, ...own[1](town) } : copy;
}

/** Ready-made detailing wording, filled with what the site says it offers. */
export function detailingCopy({ name, city, text }) {
  const mobile = /mobile|we come to you|come to you|at your (home|door|location)|wherever you are/i.test(`${name} ${text}`);
  const services = DETAILING_SERVICES.filter(([re]) => re.test(text)).map(([, n, t]) => ({ name: n, text: t }));
  // A full detail makes separate interior/exterior cards redundant.
  const full = services.some((s) => s.name.startsWith('Interior & exterior'));
  const list = (full ? services.filter((s) => !/^(Interior|Exterior) detailing$/.test(s.name)) : services).slice(0, 6);
  if (list.length < 3) for (const d of DETAILING_SERVICES.slice(0, 5)) if (list.length < 3 && !list.some((s) => s.name === d[1])) list.push({ name: d[1], text: d[2] });
  const town = city?.replace(/,\s*[A-Z]{2}$/, '') ?? '';
  return {
    kicker: `${mobile ? 'Mobile car detailing' : 'Car detailing'} · ${city}`,
    headline: mobile ? 'Showroom shine.<br><em>Wherever you are.</em>' : 'Showroom shine.<br><em>Every single time.</em>',
    intro: mobile
      ? `Professional detailing at your home or office, anywhere around ${town}. No drop-off, no waiting room: just a car that looks new again.`
      : `Professional detailing in ${town}, inside and out, for a car that looks new again.`,
    mobile: mobile ? {
      title: 'Your driveway is our shop.',
      intro: 'We bring the detail to you, so your day keeps moving.',
      points: [
        { name: 'At your door', text: `Home, apartment or office, anywhere around ${town}.` },
        { name: 'No time lost', text: 'No dropping off, no waiting for a call, no picking up.' },
        { name: 'Inside and out', text: 'Every surface, every crevice, done by hand.' },
        { name: 'Easy to book', text: 'Call, text or send the form. We confirm fast.' },
      ],
    } : null,
    servicesTitle: 'Inside, outside, and everything that shines.',
    servicesIntro: 'Pick what your car needs, from a deep interior clean to lasting paint protection.',
    services: list,
    also: ALSO.filter(([re]) => re.test(text)).map(([, n]) => ({ name: n })),
    alsoTitle: 'Not just cars:',
    why: [],
    whyTitle: '',
    howTitle: 'Book it. We show up. You drive off shining.',
    steps: [
      { name: 'Tell us about your car', text: 'Call, text or send the form: your vehicle, the service and where it is.' },
      { name: mobile ? 'We pull up' : 'Bring it in', text: mobile ? 'We arrive at your home or office with everything we need.' : 'Drop it off at a time that suits you.' },
      { name: 'You get the keys back', text: 'To a car that looks, and smells, brand new.' },
    ],
    contactTitle: 'Book your detail.',
    footerLine: `${mobile ? 'Mobile car detailing' : 'Car detailing'} in ${town}`,
    reviews: [],
    hours: [],
  };
}

/** Ready-made lawn wording, filled with what the site says it offers. Claims only when the site makes them. */
export function lawnCopy({ name, city, text }) {
  const town = city?.replace(/,\s*[A-Z]{2}$/, '') ?? '';
  let list = LAWN_SERVICES.filter(([re]) => re.test(text)).map(([, n, t]) => ({ name: n, text: t })).slice(0, 6);
  if (list.length < 3) for (const d of LAWN_SERVICES.slice(0, 5)) if (list.length < 3 && !list.some((s) => s.name === d[1])) list.push({ name: d[1], text: d[2] });
  const free = /free (estimate|quote)/i.test(text);
  const badges = [
    /licensed/i.test(text) && /insured/i.test(text) ? 'Licensed & insured' : null,
    free ? 'Free estimates' : null,
    /family[- ]owned/i.test(text) ? 'Family owned' : null,
    /veteran[- ]owned/i.test(text) ? 'Veteran owned' : null,
    /residential|homeowner/i.test(text) && /commercial|business/i.test(text) ? 'Homes and businesses' : null,
  ].filter(Boolean);
  return {
    kicker: `Lawn care & landscaping · ${city}`,
    headline: 'A lawn the whole street<br><em>notices.</em>',
    intro: `Lawn care and landscaping across ${town}: crisp edges, healthy grass and a yard you're proud of, without giving up your weekend.`,
    badges,
    highlights: null,
    servicesTitle: 'Everything your yard needs, in one call.',
    servicesIntro: 'Regular care or a one-time transformation, done by one team.',
    services: list,
    also: [],
    alsoTitle: 'We also do:',
    promise: 'We don\'t just mow. <em>We take care of it.</em> Every edge, every bed, every visit.',
    why: [],
    whyTitle: '',
    howTitle: 'A better lawn in three easy steps.',
    steps: [
      { name: free ? 'Ask for a free quote' : 'Ask for a quote', text: 'Tell us about your yard by phone or with the form below.' },
      { name: 'We take a look', text: 'We look at your lawn and beds and suggest a plan that fits.' },
      { name: 'Enjoy the view', text: 'We get to work on your schedule. You get your weekends back.' },
    ],
    contactTitle: 'Ready for a better lawn?',
    footerLine: `Lawn care & landscaping in ${town}`,
    reviews: [],
    hours: [],
  };
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

/**
 * Keeps only what the business itself said: reviews must appear word for word on their site,
 * and every number in the new wording must appear in their site text or Google facts.
 */
// Trust claims a draft may only make when their own site makes them: [claim in our copy, what the
// site must say]. The AI wording added these unasked ("Licensed & insured", "no subcontractors",
// "Ray does the work himself"), and they are the claims a business owner would object to.
export const CLAIMS = [
  [/licen[sc]ed/i, /licen[sc]/i], [/\binsured\b|insurance/i, /insur/i], [/\bbonded\b/i, /\bbonded\b/i],
  [/certified|certification/i, /certif/i], [/guarantee/i, /guarantee/i], [/warrant(y|ies)/i, /warrant/i],
  [/family[- ]owned|family[- ]run/i, /family/i], [/veteran/i, /veteran/i], [/woman[- ]owned|minority[- ]owned/i, /woman|women|minority/i],
  [/owner[- ](operated|run|led)|owners? (are|is) (personally|on site)|\b(himself|herself)\b/i, /owner|himself|herself|founder|founded/i],
  [/subcontract/i, /subcontract/i], [/in[- ]house/i, /in[- ]house/i], [/cookie[- ]cutter/i, /cookie[- ]cutter/i],
  [/same[- ]day/i, /same[- ]day/i], [/24\/7|24 hours|around the clock/i, /24\/7|24 hours|24-hour|around the clock/i],
  [/eco[- ]friendly|environmentally/i, /eco|environment|green products/i], [/award/i, /award/i],
];
// Notes the AI wrote to itself that leaked into the copy ("The site lists every day as open 24 hours").
const META = /\b(the|their) (website|brief|draft)\b|\bthe site (says|lists|shows|promises|mentions|states)\b|\b(user|brief) (gave|says)\b/i;

/** Why a piece of copy makes a claim their site does not, or null. */
export function unbackedClaim(s, source) {
  if (META.test(s)) return 'a note about the site, not copy';
  for (const [claim, need] of CLAIMS) if (claim.test(s) && !need.test(source)) return `claim not on their site (${s.match(claim)[0]})`;
  return null;
}

export function verify(copy, { text, facts }) {
  const source = norm(`${text} ${facts}`);
  // Whole numbers only: "15" must not pass because a review mentions an "F150".
  const has = (n) => new RegExp(`(^|[^\\d])${n.replace(/[.,]/g, '\\$&')}(?![\\d])`).test(source);
  const numbersOk = (s) => [...String(s).matchAll(/\d[\d,.]*/g)].every((m) => has(m[0].replace(/[.,]$/, '')));
  const dropped = [];
  const keep = (label, s) => {
    const claim = unbackedClaim(s, `${text} ${facts}`);
    if (numbersOk(s) && !claim) return true;
    dropped.push(`${label}${claim ? ` (${claim})` : ''}: ${s}`);
    return false;
  };
  const out = structuredClone(copy);
  out.reviews = (out.reviews ?? []).filter((r) => {
    const snippets = r.text.split(/\s*(?:…|\.\.\.)\s*/).filter(Boolean);
    const ok = snippets.every((p) => source.includes(norm(p).replace(/^"|"$/g, '')));
    if (!ok) dropped.push(`review: ${r.text.slice(0, 60)}`);
    return ok;
  });
  for (const f of ['kicker', 'headline', 'intro', 'servicesTitle', 'servicesIntro', 'howTitle', 'contactTitle', 'footerLine', 'whyTitle']) {
    if (out[f] && !keep(f, out[f])) out[f] = null;
  }
  out.services = (out.services ?? []).filter((s) => keep('service', `${s.name} ${s.text} ${s.price ?? ''}`));
  out.why = (out.why ?? []).filter((w) => keep('why', `${w.name} ${w.text}`));
  if (out.mobile) out.mobile.points = out.mobile.points.filter((p) => keep('point', `${p.name} ${p.text}`));
  out.steps = (out.steps ?? []).filter((s) => keep('step', `${s.name} ${s.text}`));
  out.hours = (out.hours ?? []).filter((h) => keep('hours', h));
  return { copy: out, dropped };
}

const item = { type: 'object', properties: { name: { type: 'string' }, text: { type: 'string' } }, required: ['name', 'text'], additionalProperties: false };
const SCHEMA = {
  type: 'object',
  properties: {
    wordmarkTop: { type: 'string' }, wordmarkBottom: { type: 'string' },
    kicker: { type: 'string' }, headline: { type: 'string' }, intro: { type: 'string' },
    mobileTitle: { type: 'string' }, mobileIntro: { type: 'string' }, mobilePoints: { type: 'array', items: item },
    servicesTitle: { type: 'string' }, servicesIntro: { type: 'string' },
    services: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, text: { type: 'string' }, price: { type: 'string' } }, required: ['name', 'text', 'price'], additionalProperties: false } },
    also: { type: 'array', items: { type: 'string' } },
    whyTitle: { type: 'string' }, why: { type: 'array', items: item },
    howTitle: { type: 'string' }, steps: { type: 'array', items: item },
    contactTitle: { type: 'string' }, footerLine: { type: 'string' },
    hours: { type: 'array', items: { type: 'string' } },
    reviews: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, name: { type: 'string' } }, required: ['text', 'name'], additionalProperties: false } },
    heroPhoto: { type: 'integer' },
    galleryPhotos: { type: 'array', items: { type: 'integer' } },
    photoAlts: { type: 'array', items: { type: 'object', properties: { photo: { type: 'integer' }, alt: { type: 'string' } }, required: ['photo', 'alt'], additionalProperties: false } },
    notes: { type: 'string' },
  },
  required: ['wordmarkTop', 'wordmarkBottom', 'kicker', 'headline', 'intro', 'mobileTitle', 'mobileIntro', 'mobilePoints', 'servicesTitle', 'servicesIntro', 'services', 'also', 'whyTitle', 'why', 'howTitle', 'steps', 'contactTitle', 'footerLine', 'hours', 'reviews', 'heroPhoto', 'galleryPhotos', 'photoAlts', 'notes'],
  additionalProperties: false,
};

/** The fields only this business can supply (its facts and photos). When a trade's wording library is
 *  big enough, the AI is asked for these alone: the headline, titles and steps come from the library. */
export const FACT_FIELDS = ['wordmarkTop', 'wordmarkBottom', 'intro', 'mobilePoints', 'services', 'also', 'why', 'hours', 'reviews', 'heroPhoto', 'galleryPhotos', 'photoAlts', 'notes'];
const schemaFor = (only) => (only ? { ...SCHEMA, properties: Object.fromEntries(only.map((k) => [k, SCHEMA.properties[k]])), required: only } : SCHEMA);

const SYSTEM = `You write the copy for a premium one-page website for a local service business, rebuilt from its current website, and you choose its photos.

Voice: sharp, confident, warm, plain American English. Short sentences. Concrete, not generic. Sounds like a top local business, not an agency. No exclamation marks, no clichés like "look no further", "second to none", "passion", "we pride ourselves".

Facts: use ONLY facts in the business's own site text and the Google facts given. Never invent prices, years in business, numbers, guarantees, certifications, insurance, awards, products, brands, service areas or opening hours. If the site does not say it, leave it out. Prices: only exactly as the site states them, else "".

Reviews: copy up to 6 customer reviews from the site text word for word (you may cut a long review with "…" between untouched parts). Pick ones that are specific (what was done, what changed). Use the reviewer's name exactly as shown. No reviews on the site: return [].

Structure (keep it): headline is 2 short lines joined by <br>, the second line wrapped in <em>…</em> (the part that shines). intro: 1–2 sentences. mobilePoints: 4 short points: for detailing, why coming to the customer helps (only if they do); for lawn care, why neighbors call them (schedule, care, results), from what the site says; else []. services: 3–6, in the business's own service names, each with one sentence on what it is or does. also: for detailing, other vehicles they detail (e.g. Boats, RVs); for lawn care, other property types or extra services not in the cards; only if the site says so; never town names (those are service areas). why: 3 reasons taken from what the site claims, else []. steps: 3 steps. wordmarkTop/wordmarkBottom: the business name split for a two-line logo (e.g. "Erick's" / "Auto Detailing"). hours: as the site states them, one line per day range, else [].

Photos: the numbered photos are from their site. heroPhoto: the most striking photo of finished work (a gleaming vehicle, or a green, freshly cut lawn or finished landscape), landscape if possible, bright (0 if none is good). galleryPhotos: the other good ones, best first: real finished work, foam/process shots, the team at work. Leave out flyers, before-photos of messy yards or dirty cars unless paired with the after, graphics with text, screenshots, logos, blurry or dark photos, near-duplicates, stock-looking images. Stock includes: AI-generated or 3D-rendered images, staged empty rooms or showroom interiors, generic models posing, paint swatches and tools on white, and a manufacturer's or another company's marketing photos (their watermark or logo on it). When in doubt, leave it out: a preview with no photos is fine, one with stock photos is not. photoAlts: a short, factual description for each photo you used. notes: anything a human should check (e.g. "no reviews on site", "only 3 usable photos").`;

/** The Anthropic API key: ANTHROPIC_API_KEY, or NEON_ANTHROPIC_API_KEY (the name the cloud environment uses). */
export function anthropicKey() {
  return process.env.ANTHROPIC_API_KEY || process.env.NEON_ANTHROPIC_API_KEY || '';
}

/** Asks Claude for sharper wording and the photo choice. Returns null when there is no API key. */
export async function sharpen({ kit, lead, text, draft, thumbs, model = 'claude-sonnet-5-5', only = null }) {
  const apiKey = anthropicKey();
  if (!apiKey) return null;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const facts = `Business: ${lead.name}\nTrade: ${lead.trade}\nCity: ${lead.city}\nGoogle rating: ${lead.rating} from ${lead.reviews} reviews\nPhone: ${lead.phone}${lead.note ? `\nNote: ${lead.note}` : ''}`;
  const content = [
    { type: 'text', text: `${facts}\n\nKit: ${kit}\n\n${only ? `The headline, section titles and steps are already written (from our library of reviewed sites); write only the fields asked for. The draft, for its voice:` : 'Our ready-made draft (improve on it; keep its structure):'}\n${JSON.stringify(draft)}\n\nTheir current website text:\n<site>\n${text.slice(0, 24000)}\n</site>\n\nTheir photos follow, numbered from 1.` },
    ...thumbs.flatMap((b64, i) => [{ type: 'text', text: `Photo ${i + 1}` }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }]),
  ];
  // The model is one setting in config.json ("aiModel"): claude-sonnet-5-5 (about 3-5 cents a lead)
  // or claude-haiku-5-5 (about a quarter of a cent). Low effort keeps the thinking short;
  // verify() still drops anything the business's own site doesn't back up. Sonnet can hand a
  // request it declines to its fallback model on the server; Haiku has no such fallback.
  const fallback = model.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    ...fallback,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: schemaFor(only) } },
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });
  if (response.stop_reason !== 'end_turn') throw new Error(`Claude stopped: ${response.stop_reason}`);
  const out = response.content.find((b) => b.type === 'text');
  return { result: JSON.parse(out.text), usage: response.usage, facts };
}

/** A business name as people say it: Google names often carry " in Phoenix" or " - Best Detailing". */
export function cleanName(name, city) {
  const town = (city ?? '').replace(/,\s*[A-Z]{2}$/, '');
  let n = String(name).split(/\s+[|–—-]\s+/)[0].trim();
  if (town) n = n.replace(new RegExp(`\\s+(?:in|of)\\s+${town}(?:,?\\s*[A-Z]{2})?$`, 'i'), '');
  return n.replace(/,?\s+(?:LLC|L\.L\.C\.|Inc\.?|Co\.)$/i, '').trim();
}

/** Two-line logo text: "Erick's" over "Auto Detailing". */
export function splitWordmark(name) {
  const m = name.match(/^(.+?)\s+((?:mobile\s+)?(?:car\s+|auto\s+)?(?:detailing|detail|car\s+wash|car\s+care|auto\s+spa|lawn\s+(?:care|services?)|landscaping|lawn\s+(?:&|and)\s+landscap\w*)(?:\s*(?:&|and)\s+.+)?)$/i);
  return m ? { top: m[1], bottom: m[2] } : { top: name, bottom: '' };
}
