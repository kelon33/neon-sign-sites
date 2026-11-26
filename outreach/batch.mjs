// A batch: every preview whose email is ready, written out in full for Alon to read and approve at
// once. Approval is bound to the exact text: change a word after approving and it is not sent.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { blocked } from '../pipeline/dnc.mjs';
import { timeZoneOf } from './pace.mjs';

export const PLACEHOLDER = '[POSTAL ADDRESS: required before sending]';

export const hashOf = ({ to, subject, text }) => createHash('sha256').update(`${to}\n${subject}\n${text}`).digest('hex').slice(0, 16);

/** "To: x\nSubject: y\n\nbody" → { to, subject, text } */
export function parseEmail(file) {
  const [head, ...rest] = file.replace(/\r\n/g, '\n').split('\n\n');
  const field = (name) => new RegExp(`^${name}:\\s*(.*)$`, 'mi').exec(head)?.[1]?.trim() ?? '';
  return { to: field('To').toLowerCase(), subject: field('Subject'), text: rest.join('\n\n').trim() + '\n' };
}

/**
 * Ready previews → { ready: [message], skipped: [{ slug, reason }] }. A message:
 * { slug, name, to, subject, text, link, timeZone, hash, approved: false }.
 */
export async function planBatch({ root, config, log, dnc, only = null }) {
  const ready = [];
  const skipped = [];
  const demos = path.join(root, 'demos');
  for (const slug of (await readdir(demos)).sort()) {
    if (only && !only.includes(slug)) continue;
    const dir = path.join(demos, slug);
    if (!existsSync(path.join(dir, 'email.txt'))) continue;
    const site = existsSync(path.join(dir, 'site.json')) ? JSON.parse(await readFile(path.join(dir, 'site.json'), 'utf8')) : {};
    const mail = parseEmail(await readFile(path.join(dir, 'email.txt'), 'utf8'));
    const name = site.name ?? slug;
    const skip = (reason) => skipped.push({ slug, name, reason });
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(mail.to)) { skip('no email address'); continue; }
    if (log.contacted({ email: mail.to, slug })) { skip('already contacted'); continue; }
    const no = blocked({ email: mail.to, name, listedName: site.legalName }, dnc);
    if (no) { skip(`on the do-not-contact list (${no.email ?? no.domain ?? no.name})`); continue; }
    if (mail.text.includes(PLACEHOLDER)) {
      if (!config.sender?.address) { skip('no postal address yet (config.json sender.address)'); continue; }
      mail.text = mail.text.replace(PLACEHOLDER, config.sender.address);
    }
    const link = `${config.previewBase}${slug}/`;
    if (!mail.text.includes(link)) { skip(`the email does not contain its preview link ${link}`); continue; }
    if (!/reply "no"/i.test(mail.text)) { skip('the email has no opt-out line'); continue; }
    const timeZone = timeZoneOf(site.title, site.kicker, site.footerLine, ...(site.areas ?? []).map((a) => `, ${a}`));
    if (!timeZone) { skip('cannot tell which US state it is in (for the sending hours)'); continue; }
    ready.push({ slug, name, to: mail.to, subject: mail.subject, text: mail.text, link, timeZone, hash: hashOf(mail), approved: false });
  }
  return { ready, skipped };
}

/** The batch as Alon reads it: every email in full. */
export function readable(messages) {
  return messages.map((m, i) => `#${i + 1}  ${m.name}  (${m.slug}, ${m.timeZone})\nTo: ${m.to}\nSubject: ${m.subject}\n\n${m.text}\n${'-'.repeat(64)}\n`).join('\n');
}

/** Messages that may go out: approved, and still exactly the text that was approved. */
export function approvedMessages(batch) {
  return batch.filter((m) => m.approved && m.hash === hashOf(m));
}
