import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
