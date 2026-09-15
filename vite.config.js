import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
/**
 * Dev shim for /api/races.
 *
 * In production that's a Vercel serverless function (api/races.js) which fans
 * out via the CDN. `vite dev` doesn't run Vercel functions, so this middleware
 * reimplements the same contract against the local proxy on :5175, letting the
 * client use one code path in both environments.
 */
function devRacesEndpoint() {
  return {
    name: 'dev-races-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/races', async (req, res) => {
        const { searchParams } = new URL(req.url, 'http://localhost');
        const date = searchParams.get('date');
        const type = searchParams.get('type');
        const venue = searchParams.get('venue');
        const race = searchParams.get('race');

        if (!date) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'date required as yyyy-mm-dd' }));
        }

        const path = type && venue && race
          ? `/racing/dates/${date}/meetings/${type}/${venue}/races/${race}`
          : `/racing/dates/${date}/meetings`;

        try {
          const upstream = await fetch(
            `http://localhost:5175/tab/v1/tab-info-service${path}?jurisdiction=QLD`
          );
          const body = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(body);
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({
            error: 'upstream unavailable',
            detail: `${err.message} — is proxy-server.js running? (npm run proxy)`,
          }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devRacesEndpoint()],
  server: {
    proxy: {
      '/api/tab': {
        target: 'https://api.beta.tab.com.au',
        changeOrigin: true,
        xfwd: false,
        rewrite: (path) => path.replace(/^\/api\/tab/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Remove headers that would reveal this is a proxied request
            proxyReq.removeHeader('x-forwarded-for');
            proxyReq.removeHeader('x-forwarded-host');
            proxyReq.removeHeader('x-forwarded-proto');
            proxyReq.removeHeader('x-real-ip');
            // Overwrite origin and referer to match what a real browser on tab.com.au would send
            proxyReq.setHeader('Origin', 'https://www.tab.com.au');
            proxyReq.setHeader('Referer', 'https://www.tab.com.au/');
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
            proxyReq.setHeader('Accept', 'application/json, text/plain, */*');
            proxyReq.setHeader('Accept-Language', 'en-AU,en;q=0.9');
            proxyReq.setHeader('sec-fetch-dest', 'empty');
            proxyReq.setHeader('sec-fetch-mode', 'cors');
            proxyReq.setHeader('sec-fetch-site', 'same-site');
          });
        },
      },
    },
  },
})
