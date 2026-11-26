// Sending and reading mail as each Google Workspace mailbox through the Gmail API (HTTPS only, so it
// works behind the cloud session's proxy). One Internal Google app for the whole Workspace:
//   NEON_GMAIL_CLIENT_ID, NEON_GMAIL_CLIENT_SECRET       the app (environment variables)
//   NEON_GMAIL_TOKEN_<NAME>                          one refresh token per mailbox (config.json mailboxes[].token)

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** The credentials for one mailbox, or an error naming exactly what is missing. */
export function credentials(mailbox, env = process.env) {
  const need = { NEON_GMAIL_CLIENT_ID: env.NEON_GMAIL_CLIENT_ID, NEON_GMAIL_CLIENT_SECRET: env.NEON_GMAIL_CLIENT_SECRET, [mailbox.token]: env[mailbox.token] };
  const missing = Object.entries(need).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`${mailbox.address}: missing ${missing.join(', ')} (environment settings; a new session picks them up).`);
  return { clientId: env.NEON_GMAIL_CLIENT_ID, clientSecret: env.NEON_GMAIL_CLIENT_SECRET, refreshToken: env[mailbox.token] };
}

/** A Gmail client for one mailbox: the access token is fetched once and renewed before it expires. */
export function gmailClient(creds, { fetchImpl = fetch, now = () => Date.now() } = {}) {
  let token = '';
  let expires = 0;
  async function accessToken() {
    if (token && now() < expires - 60000) return token;
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: creds.refreshToken, grant_type: 'refresh_token' }).toString(),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) throw new Error(`Google refused the mailbox credentials (${body.error ?? response.status}${body.error_description ? `: ${body.error_description}` : ''}).`);
    token = body.access_token;
    expires = now() + (body.expires_in ?? 3600) * 1000;
    return token;
  }
  async function call(path, { method = 'GET', body } = {}) {
    const response = await fetchImpl(`${API}${path}`, {
      method,
      signal: AbortSignal.timeout(30000),
      headers: { authorization: `Bearer ${await accessToken()}`, ...(body && { 'content-type': 'application/json' }) },
      ...(body && { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Gmail answered ${response.status} for ${path}: ${data?.error?.message ?? ''}`);
    return data;
  }
  return { call };
}

const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');
const headerText = (text) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${b64(text)}?=`);

/** A plain-text email, like one typed by hand: no HTML, no tracking, no images. */
export function buildMessage({ from, to, subject, text, inReplyTo = '' }) {
  const m = /^(.*?)\s*<([^>]+)>$/.exec(from.trim());
  const fromHeader = m ? `${headerText(m[1].replace(/"/g, ''))} <${m[2]}>` : from.trim();
  return [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${headerText(subject)}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text.replace(/\r?\n/g, '\r\n')).replace(/.{76}/g, '$&\r\n'),
    '',
  ].join('\r\n');
}

/** send({ to, subject, text, thread?, inReplyTo? }) → { id, thread } */
export function gmailTransport({ client, from }) {
  return async function send({ to, subject, text, thread = '', inReplyTo = '' }) {
    const raw = Buffer.from(buildMessage({ from, to, subject, text, inReplyTo }), 'utf8').toString('base64url');
    const { id, threadId } = await client.call('/messages/send', { method: 'POST', body: { raw, ...(thread && { threadId: thread }) } });
    return { id: id ?? '', thread: threadId ?? '' };
  };
}

const header = (message, name) => message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

/** The text/plain part of a Gmail message. */
export function plainText(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return Buffer.from(payload.body.data, 'base64url').toString('utf8');
  for (const part of payload.parts ?? []) {
    const text = plainText(part);
    if (text) return text;
  }
  if (payload.body?.data && /^text\//.test(payload.mimeType ?? '')) return Buffer.from(payload.body.data, 'base64url').toString('utf8').replace(/<[^>]+>/g, ' ');
  return '';
}

async function listIds(client, query, max = 500) {
  const ids = [];
  let pageToken = '';
  do {
    const page = await client.call(`/messages?q=${encodeURIComponent(query)}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`);
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken && ids.length < max);
  return ids;
}

/** Addresses this mailbox has written to in the last year (the backup of the log). */
export async function sentAddresses(client, { days = 365 } = {}) {
  const to = new Set();
  for (const id of await listIds(client, `in:sent newer_than:${days}d`, 3000)) {
    const m = await client.call(`/messages/${id}?format=metadata&metadataHeaders=To`);
    for (const a of header(m, 'To').split(',')) to.add((/<([^>]+)>/.exec(a)?.[1] ?? a).trim().toLowerCase());
  }
  to.delete('');
  return to;
}

/** Inbox mail not sent by this mailbox: { id, thread, from, subject, text, headers, at }. */
export async function inbox(client, { days = 30, seen = new Set() } = {}) {
  const messages = [];
  for (const id of await listIds(client, `in:inbox -from:me newer_than:${days}d`)) {
    if (seen.has(id)) continue;
    const m = await client.call(`/messages/${id}?format=full`);
    const headers = Object.fromEntries((m.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
    messages.push({ id, thread: m.threadId ?? '', from: headers.from ?? '', subject: headers.subject ?? '', text: plainText(m.payload) || m.snippet || '', headers, at: new Date(Number(m.internalDate)).toISOString() });
  }
  return messages;
}

/** A bounce notice: the address that could not be reached, or ''. */
export function bouncedAddress(message) {
  if (!/mailer-daemon|postmaster|mail delivery subsystem/i.test(message.from)) return '';
  const failed = message.headers?.['x-failed-recipients'];
  if (failed) return failed.split(',')[0].trim().toLowerCase();
  return (/(?:delivered to|address|to)\s+([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/i.exec(message.text)?.[1] ?? '').toLowerCase();
}
