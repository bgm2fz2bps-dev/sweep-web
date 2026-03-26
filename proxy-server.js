import http from 'http';
import https from 'https';

const PORT = process.env.PORT || 5175;
const TAB_BASE = 'api.beta.tab.com.au';

function makeTabRequest(path, res, redirectCount = 0) {
  if (redirectCount > 5) {
    res.writeHead(502);
    res.end(JSON.stringify({ error: 'Too many redirects from TAB API' }));
    return;
  }

  const options = {
    hostname: TAB_BASE,
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
      'Host': TAB_BASE,
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const { statusCode, headers } = proxyRes;

    // Follow redirects internally so the client always gets the final JSON response
    if ((statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) && headers.location) {
      proxyRes.resume(); // drain the redirect body
      let location = headers.location;
      // If the Location is a full URL, extract just the path+query
      try {
        const u = new URL(location);
        location = u.pathname + u.search;
      } catch {
        // already a relative path
      }
      makeTabRequest(location, res, redirectCount + 1);
      return;
    }

    const responseHeaders = {
      ...proxyRes.headers,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    };
    res.writeHead(statusCode, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504);
      res.end(JSON.stringify({ error: 'TAB API request timed out' }));
    }
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502);
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  proxyReq.end();
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check for Render/Railway uptime monitoring
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Strip the /tab prefix, forward the rest to the TAB API
  // e.g. /tab/v1/tab-info-service/racing/... → /v1/tab-info-service/racing/...
  const path = req.url.replace(/^\/tab/, '');
  makeTabRequest(path, res);
});

server.listen(PORT, () => {
  console.log(`TAB proxy running on http://localhost:${PORT}`);
});
