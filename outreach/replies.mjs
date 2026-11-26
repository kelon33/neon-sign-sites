// Sorting what comes back: "no" → do-not-contact list (automatically, the same day: CAN-SPAM);
// a yes or a question → for Alon, with nothing sent until he approves an answer.

import { normalize } from './log.mjs';

/** The reply's own words: quoted earlier messages and signatures dropped. */
export function ownWords(text = '') {
  const lines = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*>/.test(line)) break;
    if (/^\s*(On .+ wrote:|-{2,}\s*Original Message|From:\s|Sent from my|Get Outlook for)/i.test(line)) break;
    lines.push(line);
  }
  return lines.join('\n').trim();
}

const NO = /^\s*(no|nope|stop|unsubscribe|remove)\b|not interested|no thank|no,? thanks|remove (me|us)|take (me|us) off|unsubscribe|do not (contact|email)|don'?t (contact|email)|stop (emailing|contacting)|we('re| are) (good|all set)|all set|we have a (website|web guy|developer)|not at this time/i;
const YES = /^\s*(yes|yeah|yep|sure|ok|okay|sounds good|interested|love it|i like it|looks (great|good|nice))\b|interested|how do (i|we) (get|start|sign)|let'?s (do|go|talk)|call me|give me a call|sign (me|us) up|i'?ll take/i;
const AUTO = /out of (the )?office|automatic reply|auto[- ]?reply|autoreply|away from (the )?office|on vacation|thank you for (your email|contacting|reaching out)/i;

/** 'no' | 'yes' | 'question' | 'auto'. A "no" wins ("not interested" contains "interested"). */
export function classify({ subject = '', text = '', headers = {} }) {
  const auto = headers['auto-submitted'] && headers['auto-submitted'] !== 'no';
  if (auto || AUTO.test(subject) || AUTO.test(text.slice(0, 300))) return 'auto';
  const words = ownWords(text);
  if (NO.test(words)) return 'no';
  if (YES.test(words)) return 'yes';
  return 'question';
}

export const senderAddress = (from) => normalize(/<([^>]+)>/.exec(from ?? '')?.[1] ?? from);

/** Which log entry a reply answers: same Gmail conversation, then same address, then same domain. */
export function matchEntry(reply, entries) {
  const address = senderAddress(reply.from);
  const domain = address.split('@')[1] ?? '';
  const free = /^(gmail|yahoo|hotmail|outlook|aol|icloud|live|msn)\.com$/.test(domain);
  return (reply.thread && entries.find((e) => e.thread === reply.thread && e.via === reply.mailbox))
    ?? entries.find((e) => e.email === address)
    ?? (free ? null : entries.find((e) => e.email?.endsWith(`@${domain}`)))
    ?? null;
}
