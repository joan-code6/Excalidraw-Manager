#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run with sudo: sudo ./scripts/install-rpi-autodeploy.sh"
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PORT="${APP_PORT:-4173}"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/joan-code6/Excalidraw-Manager.git}"
APP_SERVICE_NAME="${APP_SERVICE_NAME:-excalidraw-manager.service}"
WATCHER_SERVICE_NAME="${WATCHER_SERVICE_NAME:-excalidraw-manager-autodeploy.service}"

cat >/etc/systemd/system/${APP_SERVICE_NAME} <<EOF
[Unit]
Description=Excalidraw Manager Preview Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/usr/bin/env npm run preview -- --host 127.0.0.1 --port ${APP_PORT}
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/${WATCHER_SERVICE_NAME} <<EOF
[Unit]
Description=Excalidraw Manager GitHub Auto Deploy Watcher
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/bin/bash ${REPO_DIR}/scripts/watch-updates-rpi.sh
Restart=always
RestartSec=10
Environment=BRANCH=${BRANCH}
Environment=REPO_DIR=${REPO_DIR}
Environment=REPO_URL=${REPO_URL}
Environment=POLL_INTERVAL_SECONDS=30
Environment=APP_SERVICE_NAME=${APP_SERVICE_NAME}

[Install]
WantedBy=multi-user.target
EOF

chmod +x "${REPO_DIR}/scripts/deploy-rpi.sh"
chmod +x "${REPO_DIR}/scripts/watch-updates-rpi.sh"

systemctl daemon-reload
systemctl enable --now "${APP_SERVICE_NAME}"
systemctl enable --now "${WATCHER_SERVICE_NAME}"

echo
echo "Installed and started services:"
echo "  - ${APP_SERVICE_NAME}"
echo "  - ${WATCHER_SERVICE_NAME}"
echo
echo "Cloudflare tunnel target should point to: http://127.0.0.1:${APP_PORT}"
echo "Recommended ingress in /etc/cloudflared/config.yml:"
echo "  ingress:"
echo "    - hostname: better-excalidraw.arg-server.de"
echo "      service: http://127.0.0.1:${APP_PORT}"
echo "    - service: http_status:404"
echo
echo "After updating cloudflared config: sudo systemctl restart cloudflared"
