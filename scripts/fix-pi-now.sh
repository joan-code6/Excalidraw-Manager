#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/home/bennet/production/Excalidraw-Manager"
APP_SERVICE="excalidraw-manager"
CF_SERVICE="cloudflared"
REPO_URL="https://github.com/joan-code6/Excalidraw-Manager.git"

cd "$REPO_DIR"

echo "Step 0: ensure git origin remote"
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$REPO_URL"
else
  git remote set-url origin "$REPO_URL"
fi

echo "Step 1: update repo"
git pull

echo "Step 2: ensure Node.js 20+"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is missing. Installing Node.js 20.x"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  echo "Upgrading Node.js from $(node -v) to 20.x"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "Node: $(node -v)"
echo "NPM: $(npm -v)"

echo "Step 3: install deps and build"
if ! npm ci --include=optional; then
  echo "npm ci failed, retrying with clean install"
  rm -rf node_modules
  npm install --include=optional
fi
npm run build

echo "Step 4: write valid Cloudflare config"
sudo tee /etc/cloudflared/config.yml > /dev/null << 'EOF'
tunnel: 1dd060e4-ae05-421d-850a-60a6c1cb0184
credentials-file: /home/bennet/.cloudflared/1dd060e4-ae05-421d-850a-60a6c1cb0184.json

ingress:
  - hostname: better-excalidraw.arg-server.de
    service: http://127.0.0.1:4173
  - service: http_status:404
EOF

echo "Step 5: validate Cloudflare config"
sudo cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate

echo "Step 6: reinstall systemd units from repo"
sudo bash ./scripts/install-rpi-autodeploy.sh

echo "Step 7: restart services"
sudo systemctl daemon-reload
sudo systemctl restart "$APP_SERVICE"
sudo systemctl restart "$CF_SERVICE"

echo "Step 8: verify status"
sudo systemctl status "$APP_SERVICE" --no-pager
sudo systemctl status "$CF_SERVICE" --no-pager

echo "Step 9: local health check"
curl -I http://127.0.0.1:4173

echo "Step 10: ensure DNS route"
cloudflared tunnel route dns pi-server better-excalidraw.arg-server.de

echo "Done"
echo "Open: https://better-excalidraw.arg-server.de"
