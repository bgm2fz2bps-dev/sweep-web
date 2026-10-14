#!/usr/bin/env bash
# Sweep TAB proxy — one-shot setup for an always-on Mac (the M1).
#
# Run ON THE M1, from a copy of the repo, as your normal user (it asks for
# sudo where needed):
#
#   git clone https://github.com/bgm2fz2bps-dev/sweep-web.git && cd sweep-web
#   bash scripts/m1-proxy/setup.sh
#
# Installs, as boot-time services that restart themselves:
#   1. proxy-server.js on 127.0.0.1:5175 (token-protected)
#   2. Tailscale + Funnel → permanent https://sweep-proxy.<tailnet>.ts.net
#   3. the result checker, every 5 minutes
# and sets the Mac to never sleep on power and to boot after a power cut.
#
# Re-running is safe: it keeps the existing token unless you pass --new-token.
# Uninstall: bash scripts/m1-proxy/setup.sh --uninstall
set -euo pipefail

LABEL=au.sweep
DIR="$HOME/sweep-proxy"
LOGS="$HOME/Library/Logs/sweep-proxy"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
ME="$(id -un)"
DAEMONS=/Library/LaunchDaemons

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m%s\033[0m\n' "$*"; exit 1; }

[ "$(uname)" = Darwin ] || die "Run this on the Mac that will host the proxy."
[ "$EUID" -ne 0 ] || die "Run as your normal user, not with sudo (it asks when needed)."

if [ "${1:-}" = "--uninstall" ]; then
  for job in proxy results; do
    sudo launchctl bootout system/$LABEL.$job 2>/dev/null || true
    sudo rm -f "$DAEMONS/$LABEL.$job.plist"
  done
  command -v tailscale >/dev/null && sudo tailscale funnel --https=443 off 2>/dev/null || true
  echo "Removed the proxy and result-checker services. $DIR and Tailscale are left in place."
  exit 0
fi

# ── Inputs ────────────────────────────────────────────────────────────────
read -rp "Site URL for the result checker [https://sweep-web-nine.vercel.app]: " SITE
SITE=${SITE:-https://sweep-web-nine.vercel.app}
read -rsp "CRON_SECRET (same value as in Vercel; Enter to skip the result checker): " CRON_SECRET; echo

# ── 1. Homebrew, Node, Tailscale ──────────────────────────────────────────
say "Checking Homebrew, Node and Tailscale"
if ! command -v brew >/dev/null; then
  die "Homebrew isn't installed. Install it from https://brew.sh, then re-run this script."
fi
BREW="$(brew --prefix)"
brew list node >/dev/null 2>&1 || brew install node
# Funnel needs Tailscale's open-source macOS build (Homebrew), not the App Store app.
if [ -d "/Applications/Tailscale.app" ]; then
  die "The Tailscale app is installed. Funnel needs the Homebrew version instead — quit and delete Tailscale.app, then re-run."
fi
brew list tailscale >/dev/null 2>&1 || brew install tailscale
NODE="$BREW/bin/node"

# ── 2. Proxy files + secrets ──────────────────────────────────────────────
say "Installing the proxy into $DIR"
mkdir -p "$DIR" "$LOGS"
cp "$REPO/proxy-server.js" "$DIR/proxy-server.js"
echo '{ "type": "module" }' > "$DIR/package.json"

if [ ! -f "$DIR/secrets.env" ] || [ "${1:-}" = "--new-token" ]; then
  umask 077
  {
    echo "PROXY_TOKEN=$(openssl rand -hex 32)"
    echo "CRON_SECRET=$CRON_SECRET"
    echo "SITE=$SITE"
  } > "$DIR/secrets.env"
  umask 022
else
  # keep the token, refresh the rest
  TOKEN_LINE=$(grep '^PROXY_TOKEN=' "$DIR/secrets.env")
  umask 077
  printf '%s\nCRON_SECRET=%s\nSITE=%s\n' "$TOKEN_LINE" "$CRON_SECRET" "$SITE" > "$DIR/secrets.env"
  umask 022
fi
chmod 600 "$DIR/secrets.env"

cat > "$DIR/run-proxy.sh" <<EOF
#!/bin/bash
set -a; . "$DIR/secrets.env"; set +a
export PORT=5175 HOST=127.0.0.1
exec "$NODE" "$DIR/proxy-server.js"
EOF
cat > "$DIR/check-results.sh" <<'EOF'
#!/bin/bash
set -a; . "$(dirname "$0")/secrets.env"; set +a
[ -n "$CRON_SECRET" ] || exit 0
echo "$(date '+%F %T') $(curl -sS -m 55 -X POST -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/cron/check-results" | head -c 300)"
EOF
chmod 700 "$DIR/run-proxy.sh" "$DIR/check-results.sh"

# ── 3. launchd services (start at boot, no login needed, auto-restart) ────
say "Installing background services (needs your password)"
write_daemon() { # name, program, extra-keys
  local plist="$DAEMONS/$LABEL.$1.plist"
  sudo tee "$plist" >/dev/null <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL.$1</string>
  <key>UserName</key><string>$ME</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$2</string></array>
  <key>StandardOutPath</key><string>$LOGS/$1.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$1.log</string>
  $3
</dict>
</plist>
EOF
  sudo chown root:wheel "$plist"
  sudo chmod 644 "$plist"
  sudo launchctl bootout "system/$LABEL.$1" 2>/dev/null || true
  sudo launchctl bootstrap system "$plist"
}
write_daemon proxy "$DIR/run-proxy.sh" \
  '<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>5</integer>'
if [ -n "$CRON_SECRET" ]; then
  write_daemon results "$DIR/check-results.sh" \
    '<key>StartInterval</key><integer>300</integer><key>RunAtLoad</key><true/>'
fi

sleep 2
curl -fsS http://127.0.0.1:5175/health >/dev/null || die "Proxy didn't start — see $LOGS/proxy.log"
echo "Proxy is up on 127.0.0.1:5175"

# ── 4. Tailscale Funnel (permanent public HTTPS URL) ──────────────────────
say "Starting Tailscale"
sudo brew services start tailscale >/dev/null
sleep 2
if ! sudo tailscale status >/dev/null 2>&1; then
  echo "Sign in to your (free) Tailscale account in the browser window that opens…"
  sudo tailscale up --hostname=sweep-proxy
fi
say "Turning on Funnel (approve it in the browser if asked)"
sudo tailscale funnel --bg 5175
DNS=$(sudo tailscale status --json | "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).Self.DNSName.replace(/\.$/,"")))')
URL="https://$DNS"

# ── 5. Keep the Mac awake and recovering on its own ───────────────────────
say "Power settings: never sleep on the charger, restart after power failure"
sudo pmset -c sleep 0 disksleep 0 displaysleep 10 autorestart 1 womp 1

# ── 6. Verify ─────────────────────────────────────────────────────────────
say "Checking it end to end (new Funnel names can take a few minutes to appear)"
TOKEN=$(grep '^PROXY_TOKEN=' "$DIR/secrets.env" | cut -d= -f2)
for i in $(seq 1 20); do
  curl -fsS -m 10 "$URL/health" >/dev/null 2>&1 && break
  sleep 15
done
echo "Public health check: $(curl -fsS -m 10 "$URL/health" 2>&1 || echo 'not reachable yet — re-test in a few minutes')"
echo "TAB through Funnel: $(curl -fsS -m 15 -H "X-Proxy-Token: $TOKEN" "$URL/tab/v1/tab-info-service/racing/dates/$(date +%F)/meetings?jurisdiction=QLD" 2>&1 | head -c 80)"

cat <<EOF

================ Put these in Vercel → Settings → Environment Variables ================
TAB_PROXY_URL=$URL
PROXY_TOKEN=$TOKEN
Then redeploy.

Still to do by hand on this Mac:
  • System Settings → General → Software Update → Automatic Updates:
    turn off "Install macOS updates" so it can't restart itself on race day.
  • Leave the lid open and the charger in (a closed lid sleeps unless a display is attached).

Logs:    $LOGS
Status:  sudo launchctl print system/$LABEL.proxy | grep state ; sudo tailscale funnel status
EOF
