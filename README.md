# Excalidraw Manager
A simple tool to use Excalidraw with many Canvases at the same time, and to manage them easily.

## Raspberry Pi Auto Deploy (GitHub -> Cloudflare Tunnel)

This repo includes scripts that keep your Raspberry Pi deployment updated whenever new commits reach GitHub.

### What this setup does

- Watches `origin/main` every 30 seconds.
- When a new commit is detected: pulls latest code, installs deps, builds, restarts app service.
- Your Cloudflare Tunnel serves the refreshed app on `better-excalidraw.arg-server.de`.

### 1) Clone on Raspberry Pi and install dependencies

```bash
sudo apt update
sudo apt install -y git curl

# Install Node.js LTS if needed
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

git clone https://github.com/joan-code6/Excalidraw-Manager.git
cd Excalidraw-Manager
```

### 2) Install auto-deploy services

```bash
sudo bash ./scripts/install-rpi-autodeploy.sh
```

This creates and starts:

- `excalidraw-manager.service` (serves app on `127.0.0.1:4173`)
- `excalidraw-manager-autodeploy.service` (polls GitHub and deploys changes)

### 3) Point Cloudflare Tunnel to the app

Set your Cloudflare tunnel ingress to:

```yaml
ingress:
  - hostname: better-excalidraw.arg-server.de
    service: http://127.0.0.1:4173
  - service: http_status:404
```

Then restart cloudflared:

```bash
sudo systemctl restart cloudflared
```

### Useful commands

```bash
# Check service status
systemctl status excalidraw-manager.service
systemctl status excalidraw-manager-autodeploy.service

# Watch logs live
journalctl -u excalidraw-manager-autodeploy.service -f
journalctl -u excalidraw-manager.service -f

# Run deploy manually
bash ./scripts/deploy-rpi.sh
```

## Cloudflare Tunnel Setup (pi-server)

If you already have a connected tunnel named `pi-server`, run these commands on your Raspberry Pi.

### 1) Route DNS for your hostname

```bash
cloudflared tunnel route dns pi-server better-excalidraw.arg-server.de
```

### 2) Configure cloudflared ingress

```bash
sudo mkdir -p /etc/cloudflared
sudo tee /etc/cloudflared/config.yml > /dev/null << 'EOF'
tunnel: 1dd060e4-ae05-421d-850a-60a6c1cb0184
credentials-file: /home/bennet/.cloudflared/1dd060e4-ae05-421d-850a-60a6c1cb0184.json

ingress:
  - hostname: better-excalidraw.arg-server.de
    service: http://127.0.0.1:4173
  - service: http_status:404
EOF
```

### 3) Restart cloudflared

```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
```

### 4) Verify app service + local endpoint

```bash
sudo systemctl status excalidraw-manager.service --no-pager
curl -I http://127.0.0.1:4173
```

### 5) Check tunnel logs

```bash
sudo journalctl -u cloudflared -n 50 --no-pager
```

Then open:

`https://better-excalidraw.arg-server.de`

### If credentials-file path is wrong

```bash
ls -la /home/bennet/.cloudflared
```

Pick the matching `.json` file and update `credentials-file` in `/etc/cloudflared/config.yml`.

## Emergency Pi Fix Script

If tunnel or app services get stuck, run this on the Raspberry Pi:

```bash
cd /home/bennet/production/Excalidraw-Manager
git pull
bash ./scripts/fix-pi-now.sh
```