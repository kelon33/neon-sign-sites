// Webhooks that feed the dashboard (KV binding EVENTS):
//   POST /hooks/quo     Quo (formerly OpenPhone): calls and texts to (888) 444-1847.
//                       Signed: header "openphone-signature" (or "quo-signature"): hmac;1;<timestamp>;<base64 HMAC-SHA256
//                       of "<timestamp>.<raw body>" with the base64-decoded signing key>, or the Standard Webhooks
//                       format when the secret starts with "whsec_" (standardSignatureOk). Worker secret QUO_WEBHOOK_SECRET.
//   POST /hooks/paypal  PayPal: subscriptions and payments. Checked with PayPal's verify-webhook-signature API,
//                       using Worker secrets PAYPAL_CLIENT_ID, PAYPAL_SECRET and PAYPAL_WEBHOOK_ID.
// Without its secret a hook refuses everything (503), so nothing unverified is ever stored.
// KV keys: c:<10-digit number> calls (metadata c, f, l, vm, missed, in), s:<number> texts (c, f, l, last),
//          $:<event id> payments (type, amt, cur, slug, sub, at), S:<subscription id> subscriptions (status, slug, at).

const digits = (n) => String(n ?? '').replace(/\D/g, '').slice(-10);

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** True when a Quo signature header matches the raw body. Exported for tests. */
export async function quoSignatureOk(header, body, secret) {
  if (!header || !secret) return false;
  const [scheme, , ts, sig] = header.split(';');
  if (scheme !== 'hmac' || !ts || !sig) return false;
  if (Math.abs(Date.now() - Number(ts)) > 15 * 60 * 1000) return false; // stale or replayed
  const key = await crypto.subtle.importKey('raw', fromB64(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`)));
  return mac === sig.trim();
}

async function bump(env, key, extra = {}, counters = {}) {
  const now = new Date().toISOString();
  const old = (await env.EVENTS.getWithMetadata(key)).metadata ?? {};
  const meta = { ...old, c: (old.c ?? 0) + 1, f: old.f ?? now, l: now, ...extra };
  for (const [k, v] of Object.entries(counters)) meta[k] = (old[k] ?? 0) + v;
  await env.EVENTS.put(key, '', { metadata: meta });
}

/** Standard Webhooks / Svix format (secrets that start with "whsec_"): headers webhook-id, webhook-timestamp
 *  (seconds) and webhook-signature ("v1,<base64>" entries, space-separated); signed content is
 *  "<id>.<timestamp>.<raw body>" with the base64 key after "whsec_". Exported for tests. */
export async function standardSignatureOk(headers, body, secret) {
  const id = headers.get('webhook-id') ?? headers.get('svix-id');
  const ts = headers.get('webhook-timestamp') ?? headers.get('svix-timestamp');
  const sigs = headers.get('webhook-signature') ?? headers.get('svix-signature');
  if (!id || !ts || !sigs || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 15 * 60) return false;
  const key = await crypto.subtle.importKey('raw', fromB64(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  return sigs.split(' ').some((entry) => entry.split(',')[1] === mac);
}

export async function quoHook(request, env) {
  if (!env.QUO_WEBHOOK_SECRET || !env.EVENTS) return new Response('Not configured', { status: 503 });
  const body = await request.text();
  const secret = env.QUO_WEBHOOK_SECRET.trim();
  const ok = secret.startsWith('whsec_') || request.headers.get('webhook-signature') || request.headers.get('svix-signature')
    ? await standardSignatureOk(request.headers, body, secret)
    : await quoSignatureOk(request.headers.get('openphone-signature') ?? request.headers.get('quo-signature'), body, secret);
  if (!ok) return new Response('Bad signature', { status: 401 });
  const ev = JSON.parse(body);
  const type = ev.type ?? ev.object?.type ?? '';
  const o = ev.data?.object ?? ev.object?.data?.object ?? {};
  const theirs = digits(o.direction === 'outgoing' ? (Array.isArray(o.to) ? o.to[0] : o.to) : o.from);
  if (!theirs) return new Response('ok');
  if (type.startsWith('call.completed') || type === 'call.completed') {
    const missed = ['no-answer', 'missed', 'busy', 'canceled', 'failed'].includes(o.status) || !o.answeredAt;
    await bump(env, `c:${theirs}`, { last: o.direction ?? 'incoming' }, { vm: o.voicemail ? 1 : 0, missed: missed ? 1 : 0, in: o.direction === 'outgoing' ? 0 : 1 });
  } else if (type === 'message.received') {
    await bump(env, `s:${theirs}`, { last: String(o.text ?? o.body ?? '').slice(0, 160) });
  }
  return new Response('ok');
}

async function paypalToken(env) {
  const r = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST', body: 'grant_type=client_credentials',
    headers: { authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`)}`, 'content-type': 'application/x-www-form-urlencoded' },
  });
  return (await r.json()).access_token;
}

export async function paypalHook(request, env) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET || !env.PAYPAL_WEBHOOK_ID || !env.EVENTS) return new Response('Not configured', { status: 503 });
  const body = await request.text();
  const ev = JSON.parse(body);
  const h = (n) => request.headers.get(n);
  const v = await fetch('https://api-m.paypal.com/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    headers: { authorization: `Bearer ${await paypalToken(env)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ auth_algo: h('paypal-auth-algo'), cert_url: h('paypal-cert-url'), transmission_id: h('paypal-transmission-id'),
      transmission_sig: h('paypal-transmission-sig'), transmission_time: h('paypal-transmission-time'), webhook_id: env.PAYPAL_WEBHOOK_ID, webhook_event: ev }),
  });
  if ((await v.json()).verification_status !== 'SUCCESS') return new Response('Not verified', { status: 401 });
  const r = ev.resource ?? {};
  const at = ev.create_time ?? new Date().toISOString();
  if (ev.event_type?.startsWith('BILLING.SUBSCRIPTION.')) {
    const status = ev.event_type.replace('BILLING.SUBSCRIPTION.', '').toLowerCase();
    const old = (await env.EVENTS.getWithMetadata(`S:${r.id}`)).metadata ?? {};
    await env.EVENTS.put(`S:${r.id}`, '', { metadata: { ...old, status, slug: r.custom_id ?? old.slug ?? null, at, email: r.subscriber?.email_address?.slice(0, 80) ?? old.email ?? null } });
  } else if (['PAYMENT.SALE.COMPLETED', 'PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.SALE.REFUNDED', 'PAYMENT.CAPTURE.REFUNDED'].includes(ev.event_type)) {
    const amt = Number(r.amount?.total ?? r.amount?.value ?? 0) * (/REFUNDED/.test(ev.event_type) ? -1 : 1);
    const sub = r.billing_agreement_id ?? null;
    const slug = r.custom_id ?? (sub ? (await env.EVENTS.getWithMetadata(`S:${sub}`)).metadata?.slug : null) ?? null;
    await env.EVENTS.put(`$:${ev.id}`, '', { metadata: { type: sub ? 'monthly' : 'own', amt, cur: r.amount?.currency ?? r.amount?.currency_code ?? 'USD', slug, sub, at } });
  }
  return new Response('ok');
}
