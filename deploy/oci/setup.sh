#!/usr/bin/env bash
# One-time setup of the game server on an Oracle Cloud Ubuntu 22.04/24.04 VM.
# Usage (on the VM):  curl -fsSL https://raw.githubusercontent.com/blessingstonsk/Indian-Business-Tycoon-/main/deploy/oci/setup.sh | bash
set -euo pipefail

REPO="${REPO:-https://github.com/blessingstonsk/Indian-Business-Tycoon-.git}"
APP_DIR=/opt/ibt
ENV_FILE=/etc/ibt/server.env

PUBLIC_IP="$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me)"
DOMAIN="${DOMAIN:-$(echo "$PUBLIC_IP" | tr . -).sslip.io}"
echo "==> Public IP $PUBLIC_IP, server address https://$DOMAIN"

echo "==> Installing Node.js 22, git and Caddy"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git debian-keyring debian-archive-keyring apt-transport-https gnupg openssl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update -y && sudo apt-get install -y caddy

echo "==> Opening ports 80/443 in the VM firewall (Oracle images block them by default)"
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    line="$(sudo iptables -L INPUT --line-numbers | awk '/REJECT/ {print $1; exit}')"
    sudo iptables -I INPUT "${line:-1}" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  fi
done
sudo apt-get install -y iptables-persistent >/dev/null 2>&1 || true
sudo netfilter-persistent save || true

echo "==> Fetching the code into $APP_DIR"
sudo id ibt >/dev/null 2>&1 || sudo useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin ibt
if [ -d "$APP_DIR/.git" ]; then sudo git -C "$APP_DIR" pull --ff-only; else sudo git clone "$REPO" "$APP_DIR"; fi
sudo chown -R ibt:ibt "$APP_DIR"
sudo -u ibt -H bash -c "cd $APP_DIR/server && npm ci --no-audit --no-fund && npm run build"

echo "==> Server settings in $ENV_FILE"
sudo mkdir -p /etc/ibt
if [ ! -f "$ENV_FILE" ]; then
  sudo cp "$APP_DIR/server/.env.example" "$ENV_FILE"
  sudo sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" "$ENV_FILE"
fi
sudo chown root:ibt "$ENV_FILE" && sudo chmod 640 "$ENV_FILE"

echo "==> Service + HTTPS"
sudo cp "$APP_DIR/deploy/oci/ibt-server.service" /etc/systemd/system/ibt-server.service
printf '%s {\n\tencode gzip\n\treverse_proxy 127.0.0.1:8787\n}\n' "$DOMAIN" | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable ibt-server caddy
sudo systemctl restart caddy

cat <<MSG

Done. Two things left:
  1. Fill in ORACLE_PASSWORD, ORACLE_CONNECT_STRING and GOOGLE_CLIENT_ID:
       sudo nano $ENV_FILE
  2. Start the server and check it:
       sudo systemctl restart ibt-server && sleep 3 && curl -s https://$DOMAIN/health

Your API address (VITE_API_URL for GitHub):  https://$DOMAIN
Logs:  journalctl -u ibt-server -f
MSG
