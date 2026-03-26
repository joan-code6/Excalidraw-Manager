#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${BRANCH:-main}"
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

# Refuse deploy if local changes exist to avoid accidental data loss.
if [[ -n "$(git status --porcelain)" ]]; then
  log "Working tree is dirty. Commit/stash/discard local changes, then retry deploy."
  exit 1
fi

log "Fetching latest commit"
git fetch origin "${BRANCH}"

log "Updating to origin/${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

log "Installing dependencies"
npm ci

log "Building app"
npm run build

if command -v systemctl >/dev/null 2>&1; then
  log "Restarting ${APP_SERVICE_NAME}"
  sudo systemctl restart "${APP_SERVICE_NAME}"
fi

log "Deploy complete"
