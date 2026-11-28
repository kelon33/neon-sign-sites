// Checks that need no AI, run on every new preview by pipeline/cli.mjs. Each one is a mistake found by
// hand in reviewed batches (2026-11-27): Google review texts shown through a widget, car detailers
// found by a boat search, a steps title that miscounts its steps, lines that quote removed reviews.

// Review widgets that show Google reviews on a business's own site (Google's terms: never copy them).
export const REVIEW_WIDGET = /trustindex|ti-widget|elfsight|wprev|wp-review-slider|sociablekit|embedsocial|reviewsonmywebsite|google-reviews-widget|grw-review|featurable|nicejob|birdeye-widget/i;

/** Why the reviews on their pages look like Google's (any reason drops them all), or []. */
export function googleReviewSignals(pages = []) {
  const why = new Set();
  for (const p of pages) {
    const html = `${p.rendered ?? ''}\n${p.raw ?? ''}`;
    const m = html.match(REVIEW_WIDGET);
    if (m) why.add(`a review widget (${m[0].toLowerCase()}) on ${p.url}`);
    const text = p.text ?? '';
    if (/posted on google/i.test(text)) why.add(`reviews marked "Posted on Google" on ${p.url}`);
    // A label under each review ("Google review"), not a link to their listing ("our Google reviews").
    if ((text.match(/\bgoogle review\b(?!s)/gi) ?? []).length >= 2) why.add(`reviews labelled "Google review" on ${p.url}`);
    if (/<img[^>]+src=["'][^"']*(google[^"']*stars?|stars?[^"']*google)[^"']*["']/i.test(html)) why.add(`a Google stars badge over the reviews on ${p.url}`);
  }
  return [...why];
}

const norm = (s) => String(s ?? '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#8217;|&rsquo;|&#x27;|&#39;|&#039;|[‘’]/g, "'")
  .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&quot;|[“”]/g, '"')
  .replace(/&amp;/g, '&').replace(/&nbsp;|\s+/g, ' ')
  .toLowerCase().trim();

/** Reviews to keep: none when the site shows Google's; otherwise those written into their own pages
 *  (present in the HTML their server sends, not added later by a script). */
export function ownReviews(reviews = [], pages = []) {
  const signals = googleReviewSignals(pages);
  if (signals.length) return { reviews: [], dropped: reviews.length ? [`${reviews.length} review${reviews.length === 1 ? '' : 's'}: ${signals[0]}`] : [] };
  const raw = norm(pages.map((p) => p.raw ?? '').join(' '));
  if (!raw) return { reviews, dropped: [] }; // their server's HTML was not available: keep them
  const keep = [];
  const dropped = [];
  for (const r of reviews) {
    const words = norm(r.text).replace(/["'…]/g, ' ').split(' ').filter((w) => w.length > 2);
    // A run of six words from the review must be in their own HTML.
    const runs = [];
    for (let i = 0; i + 6 <= words.length; i += 3) runs.push(words.slice(i, i + 6));
    const plainRaw = raw.replace(/["'…]/g, ' ').replace(/\s+/g, ' ');
    const found = !runs.length || runs.some((run) => plainRaw.includes(run.join(' ')));
    (found ? keep : dropped).push(r);
  }
  return { reviews: keep, dropped: dropped.map((r) => `review by ${r.name}: not in their own pages (added by a script, likely a Google widget)`) };
}

/** Lines that lean on reviews ("customers say ..."): dropped when the reviews are gone. */
export const HEARSAY = /\b(customers|clients|reviewers|people) (say|said|call|rave|love)\b|according to (our )?(customers|clients|reviews)|reviews (say|mention)/i;

/** What a detailer's site is about: 'boats', 'cars' or 'both' (a boat search finds car detailers too). */
export function vehicleCounts(text = '') {
  const t = text.toLowerCase();
  const count = (re) => (t.match(re) ?? []).length;
  return {
    boats: count(/\b(boats?|marine|yachts?|vessels?|pontoons?|hulls?|gel ?coat|watercraft|jet skis?)\b/g),
    cars: count(/\b(cars?|vehicles?|trucks?|suvs?|sedans?|automotive|auto)\b/g),
  };
}
export function vehicleFocus(text = '') {
  const { boats, cars } = vehicleCounts(text);
  if (boats < 3 && cars >= 3) return 'cars';
  if (cars < boats / 4) return 'boats';
  return 'both';
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** "Lit up in four steps." over three steps: the number follows the steps. */
export function fixStepsTitle(title, count) {
  if (!title || !count) return title;
  return String(title)
    .replace(/,?\s*shown as \w+/i, '')
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)(\s+(?:simple\s+|easy\s+)?steps?)\b/i, (m, n, rest) => {
      const word = NUMBER_WORDS[count] ?? String(count);
      const cap = /^[A-Z]/.test(n) ? word[0].toUpperCase() + word.slice(1) : word;
      return `${cap}${rest}`;
    });
}

/** Service areas wrongly listed as extra services ("We also do: Waco, Hewitt"): those that match a town. */
export function townsInAlso(also = [], { areas = [], text = '' } = {}) {
  const known = new Set(areas.map((a) => a.toLowerCase()));
  const areaText = (text.match(/(?:serv(?:e|ing|ice areas?)|areas? we serve|proudly serving)[^.]{0,400}/gi) ?? []).join(' ').toLowerCase();
  return also.filter((a) => {
    const n = (a.name ?? a).toLowerCase();
    return known.has(n) || (areaText.includes(n) && /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)?$/.test(a.name ?? a));
  });
}
