#!/usr/bin/env bash
# One-shot setup for the Sydney TAB proxy box (Ubuntu 22.04/24.04, run as root).
#
#   scp proxy-server.js scripts/proxy-box/setup.sh root@<box-ip>:/root/
#   ssh root@<box-ip> 'bash /root/setup.sh'
#
# What it does: installs Node 22 + Caddy, runs proxy-server.js as a locked-down
# systemd service on 127.0.0.1:5175, puts Caddy (automatic HTTPS) in front,
# and schedules the result checker every 5 minutes.
#
# No domain yet? The default hostname uses sslip.io (<ip>.sslip.io), which
# resolves to the box's IP and gets a real Let's Encrypt certificate.
set -euo pipefail

[ -f /root/proxy-server.js ] || { echo "Copy proxy-server.js to /root first"; exit 1; }

IP=$(curl -fsS https://api.ipify.org)
DEFAULT_HOST="$(echo "$IP" | tr . -).sslip.io"
read -rp "Hostname for the proxy [$DEFAULT_HOST]: " HOST
HOST=${HOST:-$DEFAULT_HOST}
read -rp "Site URL for the result checker [https://sweep-web-nine.vercel.app]: " SITE
SITE=${SITE:-https://sweep-web-nine.vercel.app}
read -rsp "CRON_SECRET (same as in Vercel; blank to skip the cron): " CRON_SECRET; echo

PROXY_TOKEN=$(openssl rand -hex 32)

echo "==> Packages"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https ufw >/dev/null
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi

echo "==> Proxy service"
id sweepproxy >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin sweepproxy
install -d -o root -g root /opt/sweep-proxy
install -m 0644 /root/proxy-server.js /opt/sweep-proxy/proxy-server.js
# ESM import syntax needs "type": "module"
echo '{ "type": "module" }' > /opt/sweep-proxy/package.json
umask 077
cat > /etc/sweep-proxy.env <<ENV
PORT=5175
PROXY_TOKEN=$PROXY_TOKEN
ENV
chmod 600 /etc/sweep-proxy.env

cat > /etc/systemd/system/sweep-proxy.service <<'UNIT'
[Unit]
Description=Sweep TAB proxy
After=network-online.target

[Service]
EnvironmentFile=/etc/sweep-proxy.env
ExecStart=/usr/bin/node /opt/sweep-proxy/proxy-server.js
User=sweepproxy
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
MemoryMax=256M

[Install]
WantedBy=multi-user.target
UNIT
# Only Caddy should reach the proxy port
sed -i 's/^PORT=.*/PORT=5175/' /etc/sweep-proxy.env
systemctl daemon-reload
systemctl enable --now sweep-proxy

echo "==> Caddy (HTTPS)"
cat > /etc/caddy/Caddyfile <<CADDY
$HOST {
	encode gzip
	reverse_proxy 127.0.0.1:5175
	header -Server
}
CADDY
systemctl reload caddy || systemctl restart caddy

echo "==> Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw deny 5175/tcp >/dev/null
ufw --force enable >/dev/null

if [ -n "$CRON_SECRET" ]; then
  echo "==> Result checker cron (every 5 min)"
  cat > /etc/cron.d/sweep-results <<CRON
*/5 * * * * root curl -fsS -m 55 -X POST -H "Authorization: Bearer $CRON_SECRET" $SITE/api/cron/check-results > /var/log/sweep-results.log 2>&1
CRON
  chmod 600 /etc/cron.d/sweep-results
fi

sleep 3
echo
echo "Health: $(curl -fsS https://$HOST/health || echo 'not reachable yet — DNS/cert can take a minute')"
echo "TAB test: $(curl -fsS -H "X-Proxy-Token: $PROXY_TOKEN" "https://$HOST/tab/v1/tab-info-service/racing/dates/$(date +%F)/meetings?jurisdiction=QLD" | head -c 80)"
echo
echo "================ Put these in Vercel → Settings → Environment Variables ================"
echo "TAB_PROXY_URL=https://$HOST"
echo "PROXY_TOKEN=$PROXY_TOKEN"
echo "Then redeploy (or wait for the next push)."
