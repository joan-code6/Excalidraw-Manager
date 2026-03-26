#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/joan-code6/Excalidraw-Manager.git}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-30}"
STATE_FILE="${STATE_FILE:-${REPO_DIR}/.git/excalidraw-manager-last-deployed-sha}"
DEPLOY_SCRIPT="${DEPLOY_SCRIPT:-${REPO_DIR}/scripts/deploy-rpi.sh}"

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

if ! command -v git >/dev/null 2>&1; then
  log "git is required but not installed."
  exit 1
fi

if [[ ! -f "${DEPLOY_SCRIPT}" ]]; then
  log "Deploy script not found: ${DEPLOY_SCRIPT}"
  exit 1
fi

cd "${REPO_DIR}"

if ! git_safe remote get-url origin >/dev/null 2>&1; then
  log "Missing git remote origin, adding ${REPO_URL}"
  git_safe remote add origin "${REPO_URL}"
fi

if ! BRANCH="$(resolve_branch "${BRANCH}")"; then
  log "Could not resolve a watch branch from origin. Check remote '${REPO_URL}'."
  exit 1
fi

log "Watching origin/${BRANCH} every ${POLL_INTERVAL_SECONDS}s"

while true; do
  remote_sha="$(git ls-remote --heads origin "refs/heads/${BRANCH}" | awk '{print $1}')"

  if [[ -z "${remote_sha}" ]]; then
    log "Could not resolve remote SHA for ${BRANCH}; retrying."
    sleep "${POLL_INTERVAL_SECONDS}"
    continue
  fi

  deployed_sha=""
  if [[ -f "${STATE_FILE}" ]]; then
    deployed_sha="$(cat "${STATE_FILE}")"
  fi

  if [[ "${remote_sha}" != "${deployed_sha}" ]]; then
    log "New commit detected: ${remote_sha}"
    if BRANCH="${BRANCH}" REPO_DIR="${REPO_DIR}" REPO_URL="${REPO_URL}" /bin/bash "${DEPLOY_SCRIPT}"; then
      printf '%s\n' "${remote_sha}" > "${STATE_FILE}"
      log "Updated deployed SHA to ${remote_sha}"
    else
      log "Deploy failed; will retry on next poll."
    fi
  fi

  sleep "${POLL_INTERVAL_SECONDS}"
done
