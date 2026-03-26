#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/joan-code6/Excalidraw-Manager.git}"
APP_SERVICE_NAME="${APP_SERVICE_NAME:-excalidraw-manager.service}"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

log "Starting deploy in ${REPO_DIR} on branch ${BRANCH}"
cd "${REPO_DIR}"

if ! command -v git >/dev/null 2>&1; then
  log "git is required but not installed."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  log "npm is required but not installed."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  log "node is required but not installed."
  exit 1
fi

NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  log "Node.js 20+ is required (found $(node -v)). Upgrade Node on the Raspberry Pi."
  exit 1
fi

# Refuse deploy if local changes exist to avoid accidental data loss.
if [[ -n "$(git status --porcelain)" ]]; then
  log "Working tree is dirty. Commit/stash/discard local changes, then retry deploy."
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  log "Missing git remote origin, adding ${REPO_URL}"
  git remote add origin "${REPO_URL}"
fi

log "Fetching latest commit"
git fetch origin "${BRANCH}"

log "Updating to origin/${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

log "Installing dependencies"
if ! npm ci --include=optional; then
  log "npm ci failed, retrying with clean install to recover optional native bindings"
  rm -rf node_modules
  npm install --include=optional
fi

log "Building app"
npm run build

if command -v systemctl >/dev/null 2>&1; then
  log "Restarting ${APP_SERVICE_NAME}"
  sudo systemctl restart "${APP_SERVICE_NAME}"
fi

log "Deploy complete"
