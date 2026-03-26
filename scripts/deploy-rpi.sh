#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/joan-code6/Excalidraw-Manager.git}"
APP_SERVICE_NAME="${APP_SERVICE_NAME:-excalidraw-manager.service}"
MIN_FREE_MB="${MIN_FREE_MB:-1200}"

git_safe() {
  git -c safe.directory="${REPO_DIR}" "$@"
}

resolve_branch() {
  local requested_branch="$1"
  if git ls-remote --exit-code --heads origin "refs/heads/${requested_branch}" >/dev/null 2>&1; then
    printf '%s\n' "${requested_branch}"
    return 0
  fi

  local detected_branch
  detected_branch="$(git ls-remote --symref origin HEAD 2>/dev/null | awk '/^ref:/ {sub("refs/heads/", "", $2); print $2; exit}')"
  if [[ -n "${detected_branch}" ]]; then
    log "Branch '${requested_branch}' not found on origin; using '${detected_branch}'"
    printf '%s\n' "${detected_branch}"
    return 0
  fi

  return 1
}

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

free_mb() {
  df -Pm "${REPO_DIR}" | awk 'NR==2 {print $4}'
}

cleanup_space() {
  log "Low disk space detected, attempting cleanup"
  npm cache clean --force >/dev/null 2>&1 || true
  rm -rf "${HOME}/.npm/_cacache" >/dev/null 2>&1 || true
  rm -rf "${REPO_DIR}/node_modules/.cache" >/dev/null 2>&1 || true
  if command -v journalctl >/dev/null 2>&1; then
    sudo journalctl --vacuum-size=200M >/dev/null 2>&1 || true
  fi
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get clean >/dev/null 2>&1 || true
  fi
}

ensure_free_space() {
  local current_free
  current_free="$(free_mb)"
  if [[ "${current_free}" -lt "${MIN_FREE_MB}" ]]; then
    cleanup_space
    current_free="$(free_mb)"
  fi

  if [[ "${current_free}" -lt "${MIN_FREE_MB}" ]]; then
    log "Not enough disk space: ${current_free}MB free, need at least ${MIN_FREE_MB}MB"
    exit 1
  fi
}

log "Starting deploy in ${REPO_DIR} on branch ${BRANCH}"
cd "${REPO_DIR}"

ensure_free_space

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
if [[ -n "$(git_safe status --porcelain)" ]]; then
  log "Working tree is dirty. Commit/stash/discard local changes, then retry deploy."
  exit 1
fi

if ! git_safe remote get-url origin >/dev/null 2>&1; then
  log "Missing git remote origin, adding ${REPO_URL}"
  git_safe remote add origin "${REPO_URL}"
fi

if ! BRANCH="$(resolve_branch "${BRANCH}")"; then
  log "Could not resolve a deploy branch from origin. Check remote '${REPO_URL}'."
  exit 1
fi

log "Fetching latest commit"
git_safe fetch origin "${BRANCH}"

log "Updating to origin/${BRANCH}"
git_safe checkout "${BRANCH}"
git_safe pull --ff-only origin "${BRANCH}"

log "Installing dependencies"
if ! npm ci --include=optional; then
  log "npm ci failed, retrying with clean install to recover optional native bindings"
  rm -rf node_modules
  ensure_free_space
  npm install --include=optional
fi

log "Building app"
npm run build

if command -v systemctl >/dev/null 2>&1; then
  log "Restarting ${APP_SERVICE_NAME}"
  sudo systemctl restart "${APP_SERVICE_NAME}"
fi

log "Deploy complete"
