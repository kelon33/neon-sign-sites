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
export function draftEmail({ lead, link, sender, used = { photos: true, reviews: true }, pitch = 'site' }) {
  const photoPitch = pitch === 'photos';
  const own = ['photos', 'services', ...(used.reviews ? ['reviews'] : [])].filter((w) => w !== 'photos' || (used.photos && !photoPitch));
  const ownList = own.length > 1 ? `${own.slice(0, -1).join(', ')} and ${own.at(-1)}` : own[0];
  const praise = lead.rating >= 4.7 && lead.reviews >= 20 ? `${lead.rating.toFixed(1)} stars from ${lead.reviews} Google reviews is great, but ` : '';
  const why = photoPitch ? 'your website shows almost none of your work'
    : lead.reasons?.length ? weakness(lead.reasons) : (gap(lead.improvements) ?? weakness([]));
  const subject = `I rebuilt the ${lead.name} website`;
  const rebuilt = photoPitch
    ? `So I rebuilt it with your own ${ownList}, and left room for your work. Have a look on your phone:
${link}

Send me 5 or 6 photos of jobs you're proud of and it's ready to go live. If you like it, it's yours:`
    : `So I rebuilt it, with your own ${ownList}. Have a look on your phone:
${link}

If you like it, it's yours:`;
  const body = `Hi,

I came across ${lead.name} on Google. ${praise ? praise + why : why.charAt(0).toUpperCase() + why.slice(1)}.

${rebuilt} $299 once, or $0 to start and $49 a month with hosting and edits included. If not, no hard feelings.

${sender.name}
Neon Sign Sites
${sender.address ?? '[POSTAL ADDRESS: required before sending]'}

Not interested? Reply "no" and I won't email you again.`;
  return { subject, body };
}
