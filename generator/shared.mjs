// Helpers every kit uses.

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const tel = (phone) => `tel:+1${String(phone).replace(/\D/g, '').replace(/^1/, '')}`;

/** A darker and a lighter shade of the brand colour, for depth. */
export function shade(hex, amount) {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

