// The site's two forms, handled by the Worker:
//   POST /api/preview-request   "Build my preview" on the home page → emails Alon → /thanks?for=preview
//   POST /api/go                "Make it live" from a preview      → emails Alon → the payment link
//                               for the chosen plan, or /thanks?for=go while there is none yet
// Email goes through Resend. Worker settings (Cloudflare dashboard → the Worker → Settings →
// Variables and Secrets): RESEND_API_KEY (secret). Plain variables in wrangler.jsonc: MAIL_FROM,
// NOTIFY_TO, PAYPAL_MONTHLY_URL, PAYPAL_OWN_URL.

const PLANS = { monthly: 'Monthly: first month free, then $49/month (minimum 2 paid months)', own: 'Own it: $299 one-time' };

const clean = (v, max = 300) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const slugOk = (v) => /^[a-z0-9-]{1,80}$/.test(v);

function redirect(location) {
  return new Response(null, { status: 303, headers: { location } });
}

function problem(message) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Something went wrong | Neon Sign Sites</title>
<body style="margin:0;background:#0b0b10;color:#f3f0e9;font:17px/1.6 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;text-align:center">
<div><h1 style="font-weight:500">Sorry, that didn't go through.</h1><p style="color:#a9a6b2">${message}</p>
<p>Please email us at <a style="color:#ff7aa8" href="mailto:hello@neonsignsites.com">hello@neonsignsites.com</a>, or <a style="color:#ff7aa8" href="javascript:history.back()">go back</a> and try again.</p></div></body>`;
  return new Response(html, { status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/** Sends a plain-text email to Alon. Returns true when Resend accepted it. */
export async function notify(env, { subject, text, replyTo }, fetchImpl = fetch) {
  if (!env.RESEND_API_KEY) return false;
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM || 'Neon Sign Sites <hello@neonsignsites.com>',
      to: [env.NOTIFY_TO || 'alon@neonsignsites.com'],
      subject,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

export async function previewRequest(request, env, fetchImpl) {
  const f = await request.formData().catch(() => null);
  if (!f) return problem('The form was empty.');
  if (clean(f.get('nickname'))) return redirect('/thanks?for=preview'); // honeypot: bots fill it, people never see it
  const business = clean(f.get('business'), 120);
  const website = clean(f.get('website'), 500);
  const email = clean(f.get('email'), 200);
  if (!business || !website || !isEmail(email)) return problem('Please fill in the business name, its website or Google listing, and a valid email.');
  const sent = await notify(env, {
    subject: `Preview request: ${business}`,
    text: `Someone asked for a free preview on neonsignsites.com.\n\nBusiness: ${business}\nWebsite or Google listing: ${website}\nEmail: ${email}\n\nReply to this email to answer them.`,
    replyTo: email,
  }, fetchImpl);
  return sent ? redirect('/thanks?for=preview') : problem("Our form isn't working right now.");
}

export async function makeItLive(request, env, fetchImpl) {
  const f = await request.formData().catch(() => null);
  if (!f) return problem('The form was empty.');
  if (clean(f.get('nickname'))) return redirect('/thanks?for=go');
  const plan = clean(f.get('plan'), 20);
  const site = clean(f.get('site'), 80);
  const business = clean(f.get('business'), 120);
  const domain = clean(f.get('domain'), 200);
  const name = clean(f.get('name'), 120);
  const email = clean(f.get('email'), 200);
  const phone = clean(f.get('phone'), 40);
  if (!PLANS[plan]) return problem('Please choose a plan.');
  if (!business || !name || !isEmail(email)) return problem('Please fill in your business, your name and a valid email.');
  if (f.get('terms') !== 'yes') return problem('Please confirm you agree to the terms.');
  const preview = slugOk(site) ? `https://neonsignsites.com/p/${site}/` : '(not given)';
  const sent = await notify(env, {
    subject: `Make it live: ${business} (${plan === 'own' ? '$299' : 'monthly'})`,
    text: `A business wants their site live.\n\nPlan: ${PLANS[plan]}\nBusiness: ${business}\nPreview: ${preview}\nTheir domain: ${domain || '(none given)'}\nName: ${name}\nEmail: ${email}\nPhone: ${phone || '(none given)'}\n\nThey agreed to the terms. Next: check the payment arrived, then run the launch.`,
    replyTo: email,
  }, fetchImpl);
  if (!sent) return problem("Our form isn't working right now.");
  const pay = plan === 'own' ? env.PAYPAL_OWN_URL : env.PAYPAL_MONTHLY_URL;
  return redirect(pay || `/thanks?for=go&plan=${plan}`);
}
