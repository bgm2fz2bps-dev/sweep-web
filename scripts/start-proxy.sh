#!/bin/bash
# Starts the TAB proxy server + Cloudflare tunnel, then updates Vercel deploy with new URL.

set -e

SWEEP_DIR="$HOME/Projects/sweep-web"
LOG_DIR="$HOME/Library/Logs/sweep-proxy"
PROXY_LOG="$LOG_DIR/proxy.log"
TUNNEL_LOG="$LOG_DIR/tunnel.log"

mkdir -p "$LOG_DIR"

echo "[$(date)] Starting sweep proxy..." >> "$LOG_DIR/startup.log"

# Kill any existing instances
pkill -f "node proxy-server.js" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1

# Start proxy server
cd "$SWEEP_DIR"
PROXY_TOKEN="${PROXY_TOKEN:-}" node proxy-server.js >> "$PROXY_LOG" 2>&1 &
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

# Update api/_tunnel-url.js — serverless functions can't read .env.production,
# so the URL is bundled in as a module. (Ignored once TAB_PROXY_URL is set in Vercel.)
cat > "$SWEEP_DIR/api/_tunnel-url.js" <<EOF
// Auto-maintained by scripts/start-proxy.sh (laptop tunnel fallback only).
// Once TAB_PROXY_URL is set in Vercel this value is ignored.
export const TUNNEL_URL = '$TUNNEL_URL';
EOF

# Git commit and push to trigger Vercel redeploy
cd "$SWEEP_DIR"
if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
    echo "[$(date)] Not on main, skipping auto-commit of tunnel URL" >> "$LOG_DIR/startup.log"
    exit 0
fi
git add api/_tunnel-url.js
git commit -m "chore: update Cloudflare tunnel URL [auto]" --no-verify
git push origin main

echo "[$(date)] Pushed new URL to git. Vercel will redeploy automatically." >> "$LOG_DIR/startup.log"
