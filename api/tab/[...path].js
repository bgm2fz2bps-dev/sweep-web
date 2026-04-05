export default async function handler(req, res) {
  // In Vercel, req.query.path can be either:
  // - a string: 'v1/tab-info-service/racing/dates/...'
  // - an array: ['v1', 'tab-info-service', ...]
  let pathSegments = req.query.path || [];
  if (typeof pathSegments === 'string') {
    pathSegments = pathSegments.split('/').filter(Boolean);
  }
  const tabPath = '/' + pathSegments.join('/');

  // Build query string from req.query, excluding the 'path' parameter
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'path') {
      if (Array.isArray(value)) {
        value.forEach(v => params.append(key, v));
      } else {
        params.append(key, value);
      }
    }
  }
  const queryString = params.toString();
  const tabUrl = `https://api.beta.tab.com.au${tabPath}${queryString ? '?' + queryString : ''}`;

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
