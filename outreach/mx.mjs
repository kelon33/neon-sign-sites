// Copied from site-translator.
// Does an address's domain accept mail at all? Asked through DNS-over-HTTPS, which works
// behind an HTTPS-only proxy. A domain with no MX record bounces, and bounces hurt the sender.

export async function acceptsMail(email, { fetchImpl = fetch, cache = new Map() } = {}) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  if (!cache.has(domain)) {
    cache.set(domain, (async () => {
      try {
        const response = await fetchImpl(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
          headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(10000),
        });
        const body = await response.json();
        return (body.Answer ?? []).some((a) => a.type === 15 && !/^0 \.$/.test(a.data));
      } catch {
        return true; // DNS unreachable: do not block the address on our own failure
      }
    })());
  }
  return cache.get(domain);
}
