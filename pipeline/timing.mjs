// When to send: at the start of the business's own working day, in its own time zone.
// Owners of trade businesses read email early, before they head out to jobs, so the window opens at
// 8:00 local (9:00 at weekends) and closes at 17:00; an email that misses the window waits for the next day.

const ZONES = {
  'America/New_York': 'CT DE DC FL GA ME MD MA MI NH NJ NY NC OH PA RI SC VT VA WV IN KY',
  'America/Chicago': 'AL AR IL IA KS LA MN MS MO NE ND OK SD TN TX WI',
  'America/Denver': 'CO MT NM UT WY ID',
  'America/Phoenix': 'AZ',
  'America/Los_Angeles': 'CA NV OR WA',
  'America/Anchorage': 'AK',
  'Pacific/Honolulu': 'HI',
};
const STATE_TZ = Object.fromEntries(Object.entries(ZONES).flatMap(([tz, s]) => s.split(' ').map((st) => [st, tz])));

/** The two-letter state of a preview, from its title, kicker or footer ("... in Tampa, FL"). */
export function stateOf(site = {}) {
  for (const t of [site.title, site.kicker, site.footerLine, site.address]) {
    const m = String(t ?? '').match(/,\s*([A-Z]{2})\b/);
    if (m && STATE_TZ[m[1]]) return m[1];
  }
  return null;
}

export const zoneOf = (state) => STATE_TZ[state] ?? 'America/New_York';

/** Local hour (with fraction) and weekday (0 = Sunday) in a time zone at a moment. */
export function local(tz, at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23' }).formatToParts(at).map((x) => [x.type, x.value]));
  return { hour: Number(p.hour) + Number(p.minute) / 60, day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

/** 'now' (inside the window), 'wait' (before it opens), or 'late' (closed for today). */
export function windowState(tz, at = new Date()) {
  const { hour, day } = local(tz, at);
  const open = day === 0 || day === 6 ? 9 : 8;
  return hour < open ? 'wait' : hour >= 17 ? 'late' : 'now';
}
