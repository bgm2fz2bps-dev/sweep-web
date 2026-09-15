/**
 * TAB proxy tunnel URL — auto-maintained by scripts/start-proxy.sh.
 *
 * Serverless functions can't read .env.production (that's build-time only, and
 * only for VITE_* vars in the client bundle). So the tunnel URL is written here
 * as a module that gets bundled into the function at deploy time.
 *
 * A TAB_PROXY_URL env var set in the Vercel dashboard takes precedence, so you
 * can point at a stable proxy (VPS / named tunnel) without touching this file.
 */
export const TUNNEL_URL = 'https://towards-cite-throat-elevation.trycloudflare.com';

export function tabBase() {
  const base = process.env.TAB_PROXY_URL || TUNNEL_URL;
  return `${base.replace(/\/$/, '')}/tab/v1/tab-info-service`;
}
