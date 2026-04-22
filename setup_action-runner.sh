#!/usr/bin/env bash
# =============================================================================
# setup_runner.sh — Install/configure GitHub Actions self-hosted runner
#
# Usage:
#   sudo bash setup_runner.sh <RUNNER_TOKEN>
#
# Example:
#   sudo bash setup_runner.sh ABC123...
#
# Before running:
#   1. Open your repo on GitHub:
#        psi1703/otp-relay-psi
#   2. Go to:
#        Settings -> Actions -> Runners
#   3. Click:
#        New self-hosted runner
#   4. Choose the correct platform for your server
#   5. Copy the temporary registration token GitHub shows
#   6. Run this script with that token
#
# Important:
#   - The token is temporary and expires quickly
#   - If this script says the token is invalid or expired, generate a fresh one
# =============================================================================

set -euo pipefail

BOLD="\033[1m"; GREEN="\033[92m"; YELLOW="\033[93m"; RED="\033[91m"
CYAN="\033[96m"; DIM="\033[2m"; RESET="\033[0m"

ok()      { echo -e "  ${GREEN}✓${RESET}  $*"; }
info()    { echo -e "  ${CYAN}→${RESET}  $*"; }
warn()    { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
fail()    { echo -e "  ${RED}✗${RESET}  $*"; }
section() { echo -e "\n${BOLD}$*${RESET}\n$(printf '─%.0s' {1..54})"; }

[[ "$EUID" -ne 0 ]] && { fail "Run with sudo: sudo bash $0 <RUNNER_TOKEN>"; exit 1; }
[[ $# -lt 1 ]] && { fail "Missing runner token. Usage: sudo bash $0 <RUNNER_TOKEN>"; exit 1; }

RUNNER_TOKEN="$1"
RUNNER_USER="initbox"
RUNNER_DIR="/home/${RUNNER_USER}/actions-runner"
REPO_URL="https://github.com/psi1703/otp-relay-psi"
RUNNER_VERSION="2.325.0"
HOST_SHORT="$(hostname -s)"
RUNNER_NAME="${HOST_SHORT}"

choose_arch() {
  local detected choice
  detected="$(uname -m)"

  echo
  echo -e "${BOLD}Select runner platform${RESET}"
  echo "Choose the GitHub Actions runner platform for this server."
  echo "Detected machine architecture: ${detected}"
  echo
  echo "  1) ARM64  (for aarch64 / arm64 systems like many Raspberry Pi devices)"
  echo "  2) X64    (for x86_64 / amd64 Ubuntu servers)"
  echo

  while true; do
    read -r -p "Enter choice [1-2]: " choice
    case "$choice" in
      1)
        RUNNER_ARCH="arm64"
        LABEL_ARCH="ARM64"
        return 0
        ;;
      2)
        RUNNER_ARCH="x64"
        LABEL_ARCH="X64"
        return 0
        ;;
      *)
        warn "Please enter 1 for ARM64 or 2 for X64."
        ;;
    esac
  done
}

echo -e "\n${BOLD}GitHub Actions Runner Setup${RESET}"
echo -e "${DIM}Repo: ${REPO_URL}${RESET}\n"

section "1/6  Validate runner user"
id "${RUNNER_USER}" >/dev/null 2>&1 || fail "User '${RUNNER_USER}' does not exist"
ok "Runner user exists: ${RUNNER_USER}"

section "2/6  Select runner platform"
choose_arch
RUNNER_ARCHIVE="actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_ARCHIVE}"
RUNNER_LABELS="self-hosted,Linux,${LABEL_ARCH},ubuntu-24.04,otp-relay-prod"
ok "Selected platform: ${LABEL_ARCH}"

section "3/6  Prepare runner directory"
mkdir -p "${RUNNER_DIR}"
chown -R "${RUNNER_USER}:${RUNNER_USER}" "${RUNNER_DIR}"
ok "Runner directory ready: ${RUNNER_DIR}"

section "4/6  Download and extract runner"
sudo -u "${RUNNER_USER}" bash <<EOF
set -euo pipefail
cd "${RUNNER_DIR}"

if [[ ! -f "${RUNNER_ARCHIVE}" ]]; then
  curl -L -o "${RUNNER_ARCHIVE}" "${RUNNER_URL}"
fi

if [[ ! -f "./config.sh" ]]; then
  tar xzf "${RUNNER_ARCHIVE}"
fi
EOF
ok "Runner package ready"

section "5/6  Configure runner"
if [[ -f "${RUNNER_DIR}/.runner" ]]; then
  warn "Runner already configured at ${RUNNER_DIR}"
  warn "If you want to reconfigure it, remove the existing runner config first."
else
  sudo -u "${RUNNER_USER}" bash <<EOF
set -euo pipefail
cd "${RUNNER_DIR}"
./config.sh \
  --url "${REPO_URL}" \
  --token "${RUNNER_TOKEN}" \
  --name "${RUNNER_NAME}" \
  --labels "${RUNNER_LABELS}" \
  --unattended \
  --replace
EOF
  ok "Runner configured"
fi

section "6/6  Install and start service"
cd "${RUNNER_DIR}"
./bin/installdependencies.sh || true
./svc.sh install "${RUNNER_USER}"
./svc.sh start
./svc.sh status
ok "Runner service installed and started"

echo ""
ok "Runner setup complete"
echo -e "  ${DIM}Runner name: ${RUNNER_NAME}${RESET}"
echo -e "  ${DIM}Labels: ${RUNNER_LABELS}${RESET}"
echo -e "  ${DIM}Check GitHub → Settings → Actions → Runners to confirm it is online.${RESET}"
