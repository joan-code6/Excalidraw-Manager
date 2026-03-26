#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/home/bennet/production/Excalidraw-Manager"
APP_SERVICE="excalidraw-manager"
CF_SERVICE="cloudflared"

cd "$REPO_DIR"

echo "Step 1: update repo"
git pull

echo "Step 2: install deps and build"
npm ci
npm run build

echo "Step 3: write valid Cloudflare config"
sudo tee /etc/cloudflared/config.yml > /dev/null << 'EOF'
tunnel: 1dd060e4-ae05-421d-850a-60a6c1cb0184
credentials-file: /home/bennet/.cloudflared/1dd060e4-ae05-421d-850a-60a6c1cb0184.json

ingress:
  - hostname: better-excalidraw.arg-server.de
    service: http://127.0.0.1:4173
  - service: http_status:404
EOF

echo "Step 4: validate Cloudflare config"
sudo cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate

echo "Step 5: reinstall systemd units from repo"
sudo bash ./scripts/install-rpi-autodeploy.sh

echo "Step 6: restart services"
sudo systemctl daemon-reload
sudo systemctl restart "$APP_SERVICE"
sudo systemctl restart "$CF_SERVICE"

echo "Step 7: verify status"
sudo systemctl status "$APP_SERVICE" --no-pager
sudo systemctl status "$CF_SERVICE" --no-pager

echo "Step 8: local health check"
curl -I http://127.0.0.1:4173

echo "Step 9: ensure DNS route"
cloudflared tunnel route dns pi-server better-excalidraw.arg-server.de

echo "Done"
echo "Open: https://better-excalidraw.arg-server.de"
