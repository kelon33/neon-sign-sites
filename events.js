// Visit and click tracking for the dashboard (KV namespace "neon-events", binding EVENTS).
// One key per business and kind, with the numbers in the key's metadata, so the dashboard reads
// everything with one list() call:
//   p:<slug>  their preview page was opened      g:<slug>  the "Make it live" form was opened
//   m:<slug>  "Make it live" was sent (plan)      metadata: { c: count, f: first ISO, l: last ISO, plan? }
// Bots, link scanners and HEAD requests (our own link checks) are not counted.

const BOT = /bot|crawl|spider|slurp|preview|scanner|monitor|curl|wget|python|node-fetch|axios|headless|lighthouse|facebookexternalhit|googleimageproxy|proofpoint|mimecast|barracuda|safelinks/i;

/** Which event a request is, or null. Exported for tests. */
export function eventOf(request, url) {
  if (request.method !== 'GET') return null;
  if (BOT.test(request.headers.get('user-agent') ?? '')) return null;
  const p = url.pathname.match(/^\/p\/([a-z0-9-]+)\/?$/);
  if (p) return { kind: 'p', slug: p[1] };
  if (url.pathname === '/go' || url.pathname === '/go/' || url.pathname === '/go.html') {
    const slug = (url.searchParams.get('site') ?? '').replace(/[^a-z0-9-]/g, '').slice(0, 80);
    if (slug) return { kind: 'g', slug };
  }
  return null;
}

export async function record(env, kind, slug, extra = {}) {
  if (!env.EVENTS || !slug) return;
  const key = `${kind}:${slug}`;
  const now = new Date().toISOString();
  const old = (await env.EVENTS.getWithMetadata(key)).metadata ?? {};
  const meta = { c: (old.c ?? 0) + 1, f: old.f ?? now, l: now, ...extra };
  await env.EVENTS.put(key, '', { metadata: meta });
}

/** Everything, for the dashboard: { p: { slug: meta }, g: {...}, m: {...} }. */
export async function allEvents(env) {
  const out = { p: {}, g: {}, m: {}, c: {}, s: {}, $: {}, S: {}, x: {} };
  if (!env.EVENTS) return out;
  let cursor;
  do {
    const page = await env.EVENTS.list({ cursor, limit: 1000 });
    for (const k of page.keys) { const i = k.name.indexOf(':'); const kind = k.name.slice(0, i); if (out[kind]) out[kind][k.name.slice(i + 1)] = k.metadata ?? {}; }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}
