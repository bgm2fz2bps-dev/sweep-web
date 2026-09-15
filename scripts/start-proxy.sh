#!/bin/bash
# Starts the TAB proxy server + Cloudflare tunnel, then updates Vercel deploy with new URL.

set -e

SWEEP_DIR="$HOME/Projects/sweep-web"
LOG_DIR="$HOME/Library/Logs/sweep-proxy"
PROXY_LOG="$LOG_DIR/proxy.log"
TUNNEL_LOG="$LOG_DIR/tunnel.log"
ENV_FILE="$SWEEP_DIR/.env.production"

mkdir -p "$LOG_DIR"

echo "[$(date)] Starting sweep proxy..." >> "$LOG_DIR/startup.log"

# Kill any existing instances
pkill -f "node proxy-server.js" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1

# Start proxy server
cd "$SWEEP_DIR"
node proxy-server.js >> "$PROXY_LOG" 2>&1 &
PROXY_PID=$!
echo "[$(date)] Proxy started (PID $PROXY_PID)" >> "$LOG_DIR/startup.log"

# Wait for proxy to be ready
sleep 3

# Start cloudflare tunnel, capture output to log
> "$TUNNEL_LOG"
cloudflared tunnel --url http://localhost:5175 --no-autoupdate >> "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!
echo "[$(date)] Tunnel started (PID $TUNNEL_PID)" >> "$LOG_DIR/startup.log"

# Wait for tunnel URL to appear in log (up to 30 seconds)
TUNNEL_URL=""
for i in $(seq 1 30); do
    TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
    if [ -n "$TUNNEL_URL" ]; then
        break
    fi
    sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
    echo "[$(date)] ERROR: Could not get tunnel URL" >> "$LOG_DIR/startup.log"
    exit 1
fi

echo "[$(date)] Tunnel URL: $TUNNEL_URL" >> "$LOG_DIR/startup.log"

# Update .env.production with new tunnel URL (build-time, for the client bundle)
echo "# TAB proxy via Cloudflare Tunnel → local proxy-server.js on Mac" > "$ENV_FILE"
echo "VITE_PROXY_URL=$TUNNEL_URL" >> "$ENV_FILE"

# Update api/_tunnel.js — serverless functions can't read .env.production, so the
# cron result-checker needs the URL bundled in as a module.
TUNNEL_MODULE="$SWEEP_DIR/api/_tunnel.js"
cat > "$TUNNEL_MODULE" <<EOF
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
export const TUNNEL_URL = '$TUNNEL_URL';

export function tabBase() {
  const base = process.env.TAB_PROXY_URL || TUNNEL_URL;
  return \`\${base.replace(/\/\$/, '')}/tab/v1/tab-info-service\`;
}
EOF

# Git commit and push to trigger Vercel redeploy
cd "$SWEEP_DIR"
git add .env.production api/_tunnel.js
git commit -m "chore: update Cloudflare tunnel URL [auto]" --no-verify
git push origin main

echo "[$(date)] Pushed new URL to git. Vercel will redeploy automatically." >> "$LOG_DIR/startup.log"
