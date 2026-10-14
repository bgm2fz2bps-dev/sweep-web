/**
 * TAB proxy — runs on an Australian IP (TAB geo-blocks datacenter egress).
 *
 * Only Sweep's own server code (api/races.js, api/cron/check-results.js) calls
 * this; browsers never do. So it is deliberately narrow:
 *   - only the two racing endpoints Sweep uses are forwarded (path allowlist)
 *   - if PROXY_TOKEN is set, requests must carry it in X-Proxy-Token
 *   - no CORS headers (no browser should be talking to it)
 *   - a global rate cap, so a bug or abuse can't get this IP banned by TAB
 *
 *   PROXY_TOKEN=... node proxy-server.js     # listens on :5175 (or $PORT)
 *   GET /health                              # uptime check
 */
import http from 'http';
import https from 'https';
import crypto from 'crypto';

const PORT = process.env.PORT || 5175;
const TAB_HOST = 'api.beta.tab.com.au';
const TOKEN = process.env.PROXY_TOKEN || '';
const MAX_PER_MINUTE = Number(process.env.PROXY_MAX_PER_MINUTE || 600);

// /tab/v1/tab-info-service/racing/dates/2026-11-03/meetings[/R/FLE/races/7]?jurisdiction=QLD
const ALLOWED = /^\/tab\/v1\/tab-info-service\/racing\/dates\/\d{4}-\d{2}-\d{2}\/meetings(\/[RHG]\/[A-Za-z0-9]{1,8}\/races\/\d{1,2})?(\?jurisdiction=[A-Z]{2,3})?$/;

if (!TOKEN) {
  console.warn('[proxy] PROXY_TOKEN not set — accepting unauthenticated requests. Set it in production.');
}

let windowStart = Date.now();
let windowCount = 0;
function rateLimited() {
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; windowCount = 0; }
  windowCount += 1;
  return windowCount > MAX_PER_MINUTE;
}

function tokenOk(req) {
  if (!TOKEN) return true;
  const got = Buffer.from(String(req.headers['x-proxy-token'] || ''));
  const want = Buffer.from(TOKEN);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function makeTabRequest(path, res, redirectCount = 0) {
  if (redirectCount > 5) return send(res, 502, { error: 'Too many redirects from TAB API' });

  const proxyReq = https.request({
    hostname: TAB_HOST,
    port: 443,
    path,
    method: 'GET',
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Origin': 'https://www.tab.com.au',
      'Referer': 'https://www.tab.com.au/',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'identity',
      'Accept-Language': 'en-AU,en;q=0.9',
      'Host': TAB_HOST,
    },
  }, (proxyRes) => {
    const { statusCode, headers } = proxyRes;

    // Follow redirects internally, but only ever to TAB's own host.
    if ([301, 302, 307, 308].includes(statusCode) && headers.location) {
      proxyRes.resume();
      let location;
      try {
        const u = new URL(headers.location, `https://${TAB_HOST}`);
        if (u.hostname !== TAB_HOST) return send(res, 502, { error: 'Unexpected redirect' });
        location = u.pathname + u.search;
      } catch {
        return send(res, 502, { error: 'Bad redirect' });
      }
      return makeTabRequest(location, res, redirectCount + 1);
    }

    // Pass through only what the caller needs — no cookies or TAB internals.
    res.writeHead(statusCode, {
      'Content-Type': headers['content-type'] || 'application/json',
      'Cache-Control': 'no-store',
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) send(res, 504, { error: 'TAB API request timed out' });
  });
  proxyReq.on('error', (err) => {
    if (!res.headersSent) send(res, 502, { error: err.message });
  });
  proxyReq.end();
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { status: 'ok' });
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  if (!tokenOk(req)) return send(res, 401, { error: 'Unauthorized' });
  if (!ALLOWED.test(req.url)) return send(res, 404, { error: 'Not found' });
  if (rateLimited()) return send(res, 429, { error: 'Slow down' });

  // /tab/v1/tab-info-service/... → /v1/tab-info-service/...
  makeTabRequest(req.url.replace(/^\/tab/, ''), res);
});

// HOST=127.0.0.1 on the M1/VPS so only the local tunnel/Caddy can reach it.
server.listen(PORT, process.env.HOST, () => {
  console.log(`TAB proxy running on ${process.env.HOST || '*'}:${PORT}`);
});
