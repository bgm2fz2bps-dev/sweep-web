// Vercel Edge Function — proxies TAB API requests from Australian edge nodes.
// Runs at the Vercel PoP closest to the user, which for Australian users is Sydney/Melbourne.
// This bypasses the TAB geo-block that affects our Render proxy in Singapore.
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  // Strip /api/tab prefix to get the raw TAB API path
  const tabPath = url.pathname.replace(/^\/api\/tab/, '');
  const tabUrl = `https://api.beta.tab.com.au${tabPath}${url.search}`;

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    });
  }

  const response = await fetch(tabUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://www.tab.com.au',
      'Referer': 'https://www.tab.com.au/',
      'Accept-Language': 'en-AU,en;q=0.9',
      'Host': 'api.beta.tab.com.au',
    },
    redirect: 'follow',
  });

  const responseHeaders = new Headers();
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Headers', '*');
  const ct = response.headers.get('content-type');
  if (ct) responseHeaders.set('Content-Type', ct);

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}
