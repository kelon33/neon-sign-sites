// The first email to a business: what's wrong with their site in one line, the preview link,
// the price, and what US law asks for (who we are, a postal address, a way to opt out).

const WHY = [
  [/slow \((\d+(?:\.\d)?)s\)/, (m) => `your website takes ${m[1]} seconds to open on a phone, and most people don't wait that long`],
  [/not mobile-friendly/, () => "your website is hard to read on a phone, where most people find you"],
  [/does not load|broken/, () => "your website didn't load when I tried it"],
  [/almost empty/, () => "your website says very little about what you do"],
  [/site builder|Weebly|Wix|GoDaddy/i, () => "your website looks like a template that doesn't show off your work"],
  [/copyright (\d{4})/, (m) => `your website still says © ${m[1]}, which makes it look unattended`],
  [/no https/, () => 'browsers mark your website "Not secure"'],
];

// For a "decent site" (works, but with clear gaps): the gap, said plainly. First match wins, so the
// most persuasive gaps come first.
const GAP = [
  [/no tap-to-call/, () => "people on their phone can't tap to call you from your website"],
  [/no quote or booking/, () => "your website has no quick way to ask for a quote or book"],
  [/no reviews on the site/, () => "your website doesn't show any of your reviews"],
  [/no photos|only \d photo/, () => "your website shows almost none of your work"],
  [/loads in (\d+(?:\.\d)?)s/, (m) => `your website takes ${m[1]} seconds to open`],
  [/copyright (\d{4})/, (m) => `your website still says © ${m[1]}, which makes it look unattended`],
  [/no meta description/, () => "your website shows up on Google without a proper description"],
];

/** The one-line gap for a decent site, or null. */
export function gap(improvements = []) {
  for (const [re, say] of GAP) for (const r of improvements) { const m = r.match(re); if (m) return say(m); }
  return null;
}

export function weakness(reasons = []) {
  for (const r of reasons) for (const [re, say] of WHY) { const m = r.match(re); if (m) return say(m); }
  return "your website doesn't show your work the way your reviews do";
}

// The photo pitch: their site has too few photos of their work for a gallery, so the preview has
// none, and the email says so and asks for a few job photos to finish it.
/** The sign-off: name, business, phone (when set) and postal address (CAN-SPAM). Plain text: no bold in email. */
/** The offer, as the site states it (CLAUDE.md, Offer). */
export const OFFER = 'your first month is free, then $49 a month with hosting and edits included (minimum 2 paid months after the free one, then cancel anytime). Or own it outright for $299, with the first year of hosting included, then $49 a year.';

export function signature(sender) {
  const call = sender.phone ? `If you'd rather talk it through, call me at ${sender.phone}.\n\n` : '';
  return call + [sender.name, 'Neon Sign Sites', sender.phone, sender.address ?? '[POSTAL ADDRESS: required before sending]'].filter(Boolean).join('\n');
}

/** Puts the current signature into a saved draft, so drafts written before a change (address, phone) stay current. */
export function refreshSignature(text, sender) {
  return text.replace(/\n\n(?:(?:Rather talk it through\?|If you'd rather talk it through,)[^\n]*\n\n)?[^\n]+\nNeon Sign Sites\n[\s\S]*?\n\nNot interested\?/, `\n\n${signature(sender)}\n\nNot interested?`);
}

/** The short offer line in emails (the full terms are on the site and shown before anyone pays). */
export const OFFER_SHORT = 'First month free, then $49/month, or $299 to own it.';

/** The email body after the opening line (2026-11-27 wording, agreed with Alon): short, one link, one question. */
export function compose({ opening, ownList, link, photoPitch, sender }) {
  const built = photoPitch
    ? `So I built you a new one with your own ${ownList}, and left room for your work:\n${link}\n\nSend me 5 or 6 photos of jobs you're proud of and it can be live this week. ${OFFER_SHORT}\n\nWant me to finish it?`
    : `So I built you a new one, with your own ${ownList}:\n${link}\n\nIf you like it, it can be live this week. ${OFFER_SHORT}\n\nWant me to put it live?`;
  return `Hi,\n\n${opening}\n\n${built}\n\n${signature(sender)}\n\nNot interested? Reply "no" and I won't email you again.`;
}

/** The one follow-up (FOLLOWUP_DAYS after the first email, only when there was no reaction at all), in the same thread. */
export const FOLLOWUP_DAYS = 4;
export function followupBody({ name, link, sender }) {
  return `Hi,\n\nJust checking you saw the new website I built for ${name}:\n${link}\n\nIt can be live this week, and I'm happy to change anything first. Want me to put it live?\n\n${signature(sender)}\n\nNot interested? Reply "no" and I won't email you again.`;
}

/** Subject lines under test (A/B by replies): A says what it is, B reads like a personal note. */
export function subjectFor(variant, { name, domain }) {
  return variant === 'B' ? `Quick question about ${domain || name}` : `${name} – new website (preview)`;
}

export function draftEmail({ lead, link, sender, used = { photos: true, reviews: true }, pitch = 'site' }) {
  const photoPitch = pitch === 'photos';
  const own = ['photos', 'services', ...(used.reviews ? ['reviews'] : [])].filter((w) => w !== 'photos' || (used.photos && !photoPitch));
  const ownList = own.length > 1 ? `${own.slice(0, -1).join(', ')} and ${own.at(-1)}` : own[0];
  const praise = lead.rating >= 4.7 && lead.reviews >= 20 ? `${lead.rating.toFixed(1)} stars from ${lead.reviews} Google reviews is great, but ` : '';
  const why = photoPitch ? 'your website shows almost none of your work'
    : lead.reasons?.length ? weakness(lead.reasons) : (gap(lead.improvements) ?? weakness([]));
  const opening = `I came across ${lead.name} on Google. ${praise ? praise + why : why.charAt(0).toUpperCase() + why.slice(1)}.`;
  const subject = subjectFor('A', { name: lead.name });
  return { subject, body: compose({ opening, ownList, link, photoPitch, sender }) };
}

/** Rewrites a saved draft (demos/<slug>/email.txt, any earlier wording) into the current wording,
 *  keeping its personal opening line, what was used from their site, and its link. */
export function rewordDraft(text, sender) {
  const [head, ...paras] = text.replace(/\r\n/g, '\n').split('\n\n');
  const opening = paras.find((p) => p.startsWith('I came across'));
  const link = text.match(/https:\/\/neonsignsites\.com\/p\/[^\s]+/)?.[0];
  const own = text.match(/with your own ([^.:,\n]+(?:, [^.:,\n]+)*(?: and [^.:,\n]+)?)(?:[.:]|, and left room)/)?.[1]?.trim();
  if (!opening || !link || !own) return null;
  const ownList = own.replace(/,? and left room for your work$/, '');
  const photoPitch = /left room for your work|5 or 6 photos/.test(text);
  return `${head}\n\n${compose({ opening, ownList, link, photoPitch, sender }).replace(/^Hi,\n\n/, 'Hi,\n\n')}`.replace(/^(To:[^\n]*\nSubject:[^\n]*)\n\nHi,/, '$1\n\nHi,') + '\n';
}
