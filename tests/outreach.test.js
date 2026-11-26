import test from 'node:test';
import assert from 'node:assert/strict';
import { timeZoneOf, inWindow, dailyLimit, pickMailbox } from '../outreach/pace.mjs';
import { parseEmail, hashOf, approvedMessages } from '../outreach/batch.mjs';
import { classify, ownWords, matchEntry } from '../outreach/replies.mjs';
import { buildMessage, bouncedAddress } from '../outreach/gmail.mjs';

test('time zone from the place in a site', () => {
  assert.equal(timeZoneOf('Detailing | Mobile car detailing in Phoenix, AZ'), 'America/Phoenix');
  assert.equal(timeZoneOf('1740 Elmview Dr, Houston, TX 77080'), 'America/Chicago');
  assert.equal(timeZoneOf(undefined, 'Tampa, FL'), 'America/New_York');
  assert.equal(timeZoneOf('No state here'), null);
});

test('sending window is weekday mornings in the lead\'s own time', () => {
  const tueNoonUtc = new Date('2026-12-01T16:00:00Z'); // 10:00 in Chicago, 9:00 in Phoenix, 11:00 in New York
  assert.equal(inWindow(tueNoonUtc, 'America/Chicago'), true);
  assert.equal(inWindow(new Date('2026-12-01T19:00:00Z'), 'America/New_York'), false); // 14:00
  assert.equal(inWindow(new Date('2026-12-05T16:00:00Z'), 'America/Chicago'), false); // Saturday
});

test('each mailbox ramps weekly, and falls back on bounces', () => {
  const now = new Date('2026-12-20T12:00:00Z');
  assert.equal(dailyLimit({ firstSentAt: '', now }), 5);
  assert.equal(dailyLimit({ firstSentAt: '2026-12-10T12:00:00Z', now }), 10);
  assert.equal(dailyLimit({ firstSentAt: '2026-10-01T12:00:00Z', now }), 30);
  assert.equal(dailyLimit({ firstSentAt: '2026-10-01T12:00:00Z', now, sent7: 50, bounced7: 2 }), 5);
  assert.equal(pickMailbox([{ address: 'a', left: 0 }, { address: 'b', left: 3, lastAt: '2' }, { address: 'c', left: 3, lastAt: '1' }]).address, 'c');
  assert.equal(pickMailbox([{ address: 'a', left: 0 }]), null);
});

test('approval holds only for the exact text that was approved', () => {
  const m = { ...parseEmail('To: Info@X.com\nSubject: Hi\n\nHello\nthere\n'), slug: 's' };
  assert.equal(m.to, 'info@x.com');
  assert.equal(m.text, 'Hello\nthere\n');
  const approved = { ...m, hash: hashOf(m), approved: true };
  assert.equal(approvedMessages([approved]).length, 1);
  assert.equal(approvedMessages([{ ...approved, text: 'Hello there, changed\n' }]).length, 0);
  assert.equal(approvedMessages([{ ...m, hash: hashOf(m), approved: false }]).length, 0);
});

test('replies: a no wins, quoted text is ignored', () => {
  assert.equal(classify({ text: 'Not interested, thanks.' }), 'no');
  assert.equal(classify({ text: 'Please remove me from your list' }), 'no');
  assert.equal(classify({ text: 'Looks great! How do I get started?' }), 'yes');
  assert.equal(classify({ text: 'How much is hosting after year one?' }), 'question');
  assert.equal(classify({ subject: 'Automatic reply: out of office', text: 'I am away' }), 'auto');
  assert.equal(ownWords('Sure\n\nOn Mon, Alon wrote:\n> Not interested? Reply "no"'), 'Sure');
  assert.equal(classify({ text: 'Sure\n\nOn Mon, Alon wrote:\n> Not interested? Reply "no"' }), 'yes');
});

test('a reply is matched to the business emailed', () => {
  const entries = [{ email: 'info@shop.com', slug: 'shop', via: 'alon@neonsignsites.net', thread: 't1' }];
  assert.equal(matchEntry({ from: 'Bob <bob@shop.com>' }, entries).slug, 'shop');
  assert.equal(matchEntry({ from: 'x@gmail.com', thread: 't1', mailbox: 'alon@neonsignsites.net' }, entries).slug, 'shop');
  assert.equal(matchEntry({ from: 'someone@gmail.com' }, entries), null);
});

test('messages are plain text with a proper From; bounces are recognised', () => {
  const raw = buildMessage({ from: 'Alon Katz <alon@neonsignsites.net>', to: 'a@b.com', subject: 'Hi', text: 'Hello' });
  assert.match(raw, /^From: Alon Katz <alon@neonsignsites.net>\r\n/);
  assert.match(raw, /Content-Type: text\/plain/);
  assert.doesNotMatch(raw, /text\/html/);
  assert.equal(bouncedAddress({ from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', headers: { 'x-failed-recipients': 'Gone@X.com' }, text: '' }), 'gone@x.com');
  assert.equal(bouncedAddress({ from: 'bob@x.com', headers: {}, text: '' }), '');
});
