import http from 'http';
import https from 'https';

const PORT = process.env.PORT || 5175;
const TAB_BASE = 'api.beta.tab.com.au';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

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

  // Strip the /tab prefix
  const path = req.url.replace(/^\/tab/, '');

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
      'Accept-Encoding': 'identity',  // no compression — keeps piping simple
      'Accept-Language': 'en-AU,en;q=0.9',
      'Host': TAB_BASE,
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    // Pass through all TAB API response headers, plus CORS
    const responseHeaders = {
      ...proxyRes.headers,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    };
    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    res.writeHead(504);
    res.end(JSON.stringify({ error: 'TAB API request timed out' }));
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502);
    res.end(JSON.stringify({ error: err.message }));
  });

  proxyReq.end();
});

server.listen(PORT, () => {
  console.log(`TAB proxy running on http://localhost:${PORT}`);
});
