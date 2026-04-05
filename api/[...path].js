export default async function handler(req, res) {
  // Vercel passes catch-all as req.query.path — can be string or array
  const raw = req.query.path || [];
  const segments = Array.isArray(raw) ? raw : raw.split('/').filter(Boolean);

  // Only handle /api/tab/* routes
  if (segments[0] !== 'tab') {
    return res.status(404).json({ error: 'Not found' });
  }

  // Reconstruct TAB API path (strip 'tab' prefix)
  const tabPath = '/' + segments.slice(1).join('/');

  // Build query string from req.query, excluding 'path'
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'path') {
      Array.isArray(value) ? value.forEach(v => params.append(key, v)) : params.append(key, value);
    }
  }
  const qs = params.toString();
  const tabUrl = `https://api.beta.tab.com.au${tabPath}${qs ? '?' + qs : ''}`;

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }

  const response = await fetch(tabUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'identity',
      'Origin': 'https://www.tab.com.au',
      'Referer': 'https://www.tab.com.au/',
      'Accept-Language': 'en-AU,en;q=0.9',
      'Host': 'api.beta.tab.com.au',
    },
    redirect: 'follow',
  });

  const contentType = response.headers.get('content-type');
  if (contentType) res.setHeader('Content-Type', contentType);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  const body = await response.text();
  return res.status(response.status).send(body);
}
