import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenVar, parseDraft, mime, refuse, hash } from '../pipeline/send.mjs';

const config = { sender: { name: 'Alon Katz', address: '6421 N. Florida Ave, Suite D-1009, Tampa, FL 33604' } };
const text = 'To: owner@lawnco.com\nSubject: I rebuilt the Lawn Co website\n\nHi,\n\nBody.\n\nAlon Katz\nNeon Sign Sites\n(888) 444-1847\n6421 N. Florida Ave, Suite D-1009, Tampa, FL 33604\n\nNot interested? Reply "no" and I won\'t email you again.\n';
const e = { n: 1, slug: 'lawn-co', name: 'Lawn Co', to: 'owner@lawnco.com', from: 'katz.alon@neonsignsites.co', text };
const mailboxes = [{ address: 'katz.alon@neonsignsites.co', start: '2026-11-27', ramp: [7, 10], max: 10 }];
const ok = { approved: { skip: [], hashes: { 1: hash(text) } }, sent: [], dnc: [], mailboxes, config, day: '2026-11-27' };

test('each mailbox has its own token variable', () => {
  assert.equal(tokenVar('alon.katz@neonsignsites.net'), 'NEON_GMAIL_TOKEN_ALON_KATZ_NET');
  assert.equal(tokenVar('alon@neonsignsites.co'), 'NEON_GMAIL_TOKEN_ALON_CO');
});

test('a draft becomes a plain-text email with an unsubscribe header', () => {
  const d = parseDraft(text);
  assert.equal(d.to, 'owner@lawnco.com');
  assert.equal(d.subject, 'I rebuilt the Lawn Co website');
  assert.ok(d.body.startsWith('Hi,') && d.body.includes('Suite D-1009'));
  const raw = Buffer.from(mime({ from: e.from, fromName: 'Alon Katz', ...d }), 'base64url').toString();
  assert.match(raw, /^From: Alon Katz <katz\.alon@neonsignsites\.co>\r\n/);
  assert.match(raw, /List-Unsubscribe: <mailto:katz\.alon@neonsignsites\.co\?subject=unsubscribe>/);
  assert.match(raw, /Content-Type: text\/plain; charset=UTF-8/);
});

test('only an approved, unchanged email within the rules goes out', () => {
  assert.equal(refuse(e, ok), null);
  assert.match(refuse(e, { ...ok, approved: null }), /not approved/);
  assert.match(refuse(e, { ...ok, approved: { ...ok.approved, skip: [1] } }), /skipped/);
  assert.match(refuse({ ...e, text: text.replace('Body.', 'Other.') }, ok), /changed after approval/);
  assert.match(refuse({ ...e, from: 'alon@neonsignsites.com' }, ok), /neonsignsites\.com/);
  assert.match(refuse(e, { ...ok, sent: [{ slug: 'x', to: 'owner@lawnco.com' }] }), /already emailed/);
  assert.match(refuse(e, { ...ok, dnc: [{ email: 'owner@lawnco.com' }] }), /do-not-contact/);
  assert.match(refuse(e, { ...ok, day: '2026-11-26' }), /limit/); // before the mailbox starts
  const full = Array.from({ length: 7 }, (_, i) => ({ slug: `s${i}`, to: `t${i}@x.com`, from: e.from, date: '2026-11-27' }));
  assert.match(refuse(e, { ...ok, sent: full }), /limit/);
});

test('replies: a clear no is an opt-out, bounces are bounces, the rest are replies', async () => {
  const { kind } = await import('../pipeline/replies.mjs');
  assert.equal(kind({ from: 'Bob <bob@x.com>', subject: 'Re: I rebuilt', text: 'No\n\n> On Fri ...' }), 'no');
  assert.equal(kind({ from: 'bob@x.com', subject: 'Re: x', text: 'Not interested, thanks.' }), 'no');
  assert.equal(kind({ from: 'bob@x.com', subject: 'Re: x', text: 'Please remove me from your list' }), 'no');
  assert.equal(kind({ from: 'bob@x.com', subject: 'unsubscribe', text: '' }), 'no');
  assert.equal(kind({ from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', subject: 'Delivery Status Notification (Failure)', text: '' }), 'bounce');
  assert.equal(kind({ from: 'bob@x.com', subject: 'Re: x', text: 'Looks great! How does the monthly plan work?' }), 'reply');
  assert.equal(kind({ from: 'bob@x.com', subject: 'Re: x', text: 'No way, this looks amazing. Call me.' }), 'reply');
});

test('timing: state from the preview, its time zone, and the 8:00-17:00 local window', async () => {
  const { stateOf, zoneOf, windowState } = await import('../pipeline/timing.mjs');
  assert.equal(stateOf({ title: "Ziggi's Landscaping | Landscaping & lawn care in Tampa, FL" }), 'FL');
  assert.equal(stateOf({ kicker: 'Paintless dent repair · Crowley, TX' }), 'TX');
  assert.equal(stateOf({ title: 'No state here' }), null);
  assert.equal(zoneOf('AZ'), 'America/Phoenix');
  assert.equal(zoneOf(null), 'America/New_York');
  // Wednesday 2026-12-02 at 13:30 UTC = 8:30 in New York, 7:30 in Chicago.
  const at = new Date('2026-12-02T13:30:00Z');
  assert.equal(windowState('America/New_York', at), 'now');
  assert.equal(windowState('America/Chicago', at), 'wait');
  assert.equal(windowState('America/New_York', new Date('2026-12-02T23:00:00Z')), 'late'); // 18:00 New York
  assert.equal(windowState('America/New_York', new Date('2026-12-05T13:30:00Z')), 'wait'); // Saturday 8:30: opens at 9
});

test('an answer goes in the same thread, as a reply', async () => {
  const { answerMime } = await import('../pipeline/answer.mjs');
  const raw = Buffer.from(answerMime({ from: 'alon@neonsignsites.co', fromName: 'Alon Katz', to: 'bob@x.com', subject: 'Quick question about x.com', inReplyTo: '<abc@mail.gmail.com>', body: 'Hi Bob' }), 'base64url').toString();
  assert.match(raw, /Subject: Re: Quick question about x\.com/);
  assert.match(raw, /In-Reply-To: <abc@mail\.gmail\.com>\r\nReferences: <abc@mail\.gmail\.com>/);
});

test('address check: a domain recorded without a mail server is left out of the plan', async () => {
  const { plan } = await import('../pipeline/queue.mjs');
  const { noMail } = await import('../pipeline/mx.mjs');
  const mx = { 'deadco.com': { ok: false }, 'liveco.com': { ok: true } };
  assert.equal(noMail('a@deadco.com', mx), true);
  assert.equal(noMail('a@liveco.com', mx), false);
  assert.equal(noMail('a@unchecked.com', mx), false);
  const ready = [{ slug: 'dead', to: 'a@deadco.com', name: 'Dead' }, { slug: 'live', to: 'b@liveco.com', name: 'Live' }];
  const { out, skipped } = plan({ ready, sent: [], dnc: [], mx, mailboxes: [{ address: 'alon@neonsignsites.net', start: '2026-11-27', daily: { first: 3, step: 2 }, max: 10 }], day: '2026-11-28' });
  assert.deepEqual(out.map((o) => o.slug), ['live']);
  assert.match(skipped.join(), /no mail server/);
});

test('follow-up: one, same thread, only after 4 days with no reaction', async () => {
  const { dueFollowups } = await import('../pipeline/queue.mjs');
  const first = (slug, date) => ({ slug, to: `${slug}@x.com`, from: 'alon@neonsignsites.net', date, subject: 'S', messageId: 'm' + slug, threadId: 't' + slug });
  const sent = [first('old', '2026-11-27'), first('new', '2026-11-30'), first('replied', '2026-11-27'), first('done', '2026-11-27'), { ...first('done', '2026-12-01'), kind: 'followup' }];
  const due = dueFollowups({ sent, replies: [{ slug: 'replied', kind: 'reply' }], dnc: [], day: '2026-12-01' });
  assert.deepEqual(due.map((d) => d.slug), ['old']);
  const { refuse, hash } = await import('../pipeline/send.mjs');
  const text = 'To: old@x.com\nSubject: Re: S\n\nHi\n\n6421 N. Florida Ave\n\nNot interested? Reply "no" and I won\'t email you again.\n';
  const e = { n: 1, kind: 'followup', slug: 'old', name: 'Old', to: 'old@x.com', from: 'alon@neonsignsites.net', text };
  const ctx = { approved: { skip: [], hashes: { 1: hash(text) } }, sent, dnc: [], replies: [], mailboxes: [{ address: 'alon@neonsignsites.net', start: '2026-11-27', daily: { first: 3, step: 2 }, max: 10 }], config: { sender: { address: '6421 N. Florida Ave' } }, day: '2026-12-01' };
  assert.equal(refuse(e, ctx), null);
  assert.match(refuse(e, { ...ctx, replies: [{ slug: 'old', kind: 'no' }] }), /reacted/);
  assert.match(refuse({ ...e, slug: 'done', to: 'done@x.com' }, ctx), /already followed up/);
  assert.match(refuse({ ...e, kind: undefined }, ctx), /already emailed/);
});
