// The do-not-contact list (do-not-contact.json): anyone who replied "no" is never emailed again.
// A lead matches by email address, by the domain of its email or website, or by business name.

const host = (s) => { try { return new URL(/^https?:/.test(s) ? s : `http://${s}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const domainOf = (email) => (email?.split('@')[1] ?? '').toLowerCase();
const FREE_MAIL = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'live.com', 'msn.com']);
const plain = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** The do-not-contact entry this lead matches, or null. */
export function blocked(lead, entries = []) {
  const emails = [lead.email, ...(lead.emails ?? [])].filter(Boolean).map((e) => e.toLowerCase());
  const domains = new Set([...emails.map(domainOf), host(lead.website ?? '')].filter((d) => d && !FREE_MAIL.has(d)));
  const names = [lead.name, lead.listedName].filter(Boolean).map(plain);
  for (const e of entries) {
    if (e.email && emails.includes(e.email.toLowerCase())) return e;
    const d = e.domain ? host(e.domain) : (e.email && !FREE_MAIL.has(domainOf(e.email)) ? domainOf(e.email) : '');
    if (d && domains.has(d)) return e;
    if (e.name && names.includes(plain(e.name))) return e;
  }
  return null;
}
