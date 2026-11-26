// When to send, and how many a day: each lead's own business hours, each mailbox's own warm-up.

// The time zone most of each state lives in (split states: the larger part).
const STATE_TZ = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago', CA: 'America/Los_Angeles',
  CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York', FL: 'America/New_York',
  GA: 'America/New_York', HI: 'Pacific/Honolulu', ID: 'America/Boise', IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis',
  IA: 'America/Chicago', KS: 'America/Chicago', KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York',
  MD: 'America/New_York', MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago', MS: 'America/Chicago',
  MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago', NV: 'America/Los_Angeles', NH: 'America/New_York',
  NJ: 'America/New_York', NM: 'America/Denver', NY: 'America/New_York', NC: 'America/New_York', ND: 'America/Chicago',
  OH: 'America/New_York', OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago', UT: 'America/Denver',
  VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles', WV: 'America/New_York', WI: 'America/Chicago',
  WY: 'America/Denver',
};

/** "Houston, TX", "…, Houston, TX 77080" or "Detailing in Phoenix, AZ" → its time zone. Unknown → null. */
export function timeZoneOf(...places) {
  for (const place of places) {
    const states = [...String(place ?? '').matchAll(/,\s*([A-Z]{2})\b/g)].map((m) => m[1]).filter((s) => STATE_TZ[s]);
    if (states.length) return STATE_TZ[states.at(-1)];
  }
  return null;
}

/** Weekday, hour and date in a time zone. */
export function localTime(now = new Date(), timeZone = 'America/New_York') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return { weekday: parts.weekday, hour: Number(parts.hour) % 24, date: `${parts.year}-${parts.month}-${parts.day}` };
}

/** Monday to Friday, fromHour to toHour in the lead's own time zone: when owners read their mail. */
export function inWindow(now, timeZone, { fromHour = 8, toHour = 12, days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] } = {}) {
  const { weekday, hour } = localTime(now, timeZone);
  return days.includes(weekday) && hour >= fromHour && hour < toHour;
}

/** The day a mailbox's count resets: US Eastern date. */
export const sendDay = (now = new Date()) => localTime(now, 'America/New_York').date;

/**
 * A mailbox's limit today: one ramp step per week since its first cold email, held at the first
 * step while the last 7 days look unhealthy (2% or more bounced, once there are 20 or more sent).
 */
export function dailyLimit({ firstSentAt, now = new Date(), ramp = [10, 15, 20, 30], max = 30, sent7 = 0, bounced7 = 0 }) {
  let limit = ramp[0];
  if (firstSentAt) {
    const weeks = Math.floor((now.getTime() - Date.parse(firstSentAt)) / (7 * 86400000));
    limit = ramp[Math.min(Math.max(weeks, 0), ramp.length - 1)];
  }
  if (sent7 >= 20 && bounced7 / sent7 >= 0.02) limit = ramp[0];
  return Math.min(limit, max);
}

/** The mailbox with the most room left today (ties: the one used least recently), or null. */
export function pickMailbox(boxes) {
  const open = boxes.filter((b) => b.left > 0);
  if (!open.length) return null;
  return open.sort((a, b) => b.left - a.left || (a.lastAt ?? '').localeCompare(b.lastAt ?? ''))[0];
}
