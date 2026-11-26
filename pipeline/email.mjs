// The first email to a business: what's wrong with their site in one line, the preview link,
// the price, and what US law asks for (who we are, a postal address, a way to opt out).

const WHY = [
  [/slow \((\d+(?:\.\d)?)s\)/, (m) => `your website takes ${m[1]} seconds to open on a phone, and most people don't wait that long`],
  [/not mobile-friendly/, () => "your website is hard to read on a phone, where most people find you"],
  [/does not load|broken/, () => "your website didn't load when I tried it"],
  [/almost empty/, () => "your website says very little about what you do"],
  [/site builder|Weebly|Wix|GoDaddy/i, () => "your website looks like a template that doesn't show off your work"],
];

export function weakness(reasons = []) {
  for (const r of reasons) for (const [re, say] of WHY) { const m = r.match(re); if (m) return say(m); }
  return "your website doesn't show your work the way your reviews do";
}

export function draftEmail({ lead, link, sender, used = { photos: true, reviews: true } }) {
  const own = ['photos', 'services', ...(used.reviews ? ['reviews'] : [])].filter((w) => w !== 'photos' || used.photos);
  const ownList = own.length > 1 ? `${own.slice(0, -1).join(', ')} and ${own.at(-1)}` : own[0];
  const praise = lead.rating >= 4.7 && lead.reviews >= 20 ? `${lead.rating.toFixed(1)} stars from ${lead.reviews} Google reviews is great, but ` : '';
  const why = weakness(lead.reasons);
  const subject = `I rebuilt the ${lead.name} website`;
  const body = `Hi,

I came across ${lead.name} on Google. ${praise ? praise + why : why.charAt(0).toUpperCase() + why.slice(1)}.

So I rebuilt it, with your own ${ownList}. Have a look on your phone:
${link}

If you like it, it's yours: $299 once, or $0 to start and $49 a month with hosting and edits included. If not, no hard feelings.

${sender.name}
Neon Sign Sites
${sender.address ?? '[POSTAL ADDRESS: required before sending]'}

Not interested? Reply "no" and I won't email you again.`;
  return { subject, body };
}
