// outreach/log.json: everyone written to, by which mailbox, and when. Committed, so every session
// (and every scheduled run) knows who was already contacted; each mailbox's sent folder is the backup.

import { existsSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { sendDay } from './pace.mjs';

export const normalize = (email) => (email ?? '').trim().toLowerCase();

export async function openLog(file) {
  const entries = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : [];
  async function save() {
    await writeFile(`${file}.tmp`, JSON.stringify(entries, null, 1) + '\n');
    await rename(`${file}.tmp`, file); // never a half-written log
  }
  return {
    entries,
    /** Was this address or this preview ever written to (or is a message to it under way)? */
    contacted({ email, slug }) {
      const e = normalize(email);
      return entries.some((x) => (e && x.email === e) || (slug && x.slug === slug));
    },
    async record(entry) {
      const existing = entries.find((x) => x.email === entry.email && x.slug === entry.slug);
      if (existing) Object.assign(existing, entry); else entries.push(entry);
      await save();
    },
    /** First-contact emails a mailbox sent on today's (US Eastern) date. */
    sentToday(mailbox, now = new Date()) {
      const day = sendDay(now);
      return entries.filter((x) => x.via === mailbox && x.status !== 'failed' && x.at && sendDay(new Date(x.at)) === day).length;
    },
    firstSentAt(mailbox) {
      return entries.filter((x) => x.via === mailbox && x.status === 'sent').map((x) => x.at).sort()[0] ?? '';
    },
    lastAt(mailbox) {
      return entries.filter((x) => x.via === mailbox && x.at).map((x) => x.at).sort().at(-1) ?? '';
    },
    sentSince(mailbox, since) {
      return entries.filter((x) => x.via === mailbox && x.status === 'sent' && Date.parse(x.at) >= since);
    },
  };
}
