/**
 * Where server-side code reaches TAB from.
 *
 * TAB geo-blocks datacenter egress (including Vercel syd1), so every request
 * goes via proxy-server.js on an Australian IP. Set TAB_PROXY_URL in Vercel to
 * the stable Sydney box; the laptop tunnel URL in _tunnel-url.js is only a
 * fallback while that box doesn't exist.
 *
 * PROXY_TOKEN (same value in Vercel and on the proxy box) stops anyone else
 * using the proxy — an open proxy is how its IP gets blocked by TAB.
 */
import { TUNNEL_URL } from './_tunnel-url.js';

export function tabBase() {
  const base = process.env.TAB_PROXY_URL || TUNNEL_URL;
  return `${base.replace(/\/$/, '')}/tab/v1/tab-info-service`;
}

export function proxyHeaders() {
  const headers = { Accept: 'application/json' };
  if (process.env.PROXY_TOKEN) headers['X-Proxy-Token'] = process.env.PROXY_TOKEN;
  return headers;
}
