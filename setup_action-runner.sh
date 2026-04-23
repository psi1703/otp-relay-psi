#!/usr/bin/env bash
# =============================================================================
# setup_action-runner.sh — Install/configure GitHub Actions self-hosted runner
#
# Usage:
#   sudo bash setup_action-runner.sh <RUNNER_TOKEN> [arm64|x64]
#
# Example:
#   sudo bash setup_action-runner.sh ABC123...
#   sudo bash setup_action-runner.sh ABC123... arm64
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

[[ "${EUID}" -ne 0 ]] && { fail "Run with sudo: sudo bash $0 <RUNNER_TOKEN> [arm64|x64]"; exit 1; }
[[ $# -lt 1 ]] && { fail "Missing runner token. Usage: sudo bash $0 <RUNNER_TOKEN> [arm64|x64]"; exit 1; }

RUNNER_TOKEN="$1"
ARCH_OVERRIDE="${2:-}"

# Detect real non-root user who launched sudo
RUNNER_USER="${SUDO_USER:-}"
if [[ -z "${RUNNER_USER}" || "${RUNNER_USER}" == "root" ]]; then
  fail "Could not detect the normal server user automatically."
  fail "Run this as: sudo bash $0 <RUNNER_TOKEN> [arm64|x64]"
  fail "Do not run it from a root login shell."
  exit 1
fi

RUNNER_HOME="$(getent passwd "${RUNNER_USER}" | cut -d: -f6)"
[[ -z "${RUNNER_HOME}" ]] && { fail "Could not determine home directory for ${RUNNER_USER}"; exit 1; }

RUNNER_DIR="${RUNNER_HOME}/actions-runner"
REPO_URL="https://github.com/psi1703/otp-relay-psi"
RUNNER_VERSION="2.325.0"
HOST_SHORT="$(hostname -s)"
RUNNER_NAME="${HOST_SHORT}"

OS_ID=""
OS_VERSION_ID=""
OS_PRETTY_NAME=""

pkg_exists() {
  apt-cache show "$1" >/dev/null 2>&1
}

install_first_available() {
  local pkg
  for pkg in "$@"; do
    if pkg_exists "$pkg"; then
      info "Installing package: $pkg"
      DEBIAN_FRONTEND=noninteractive apt-get install -y "$pkg"
      return 0
    fi
  done

  warn "None of these packages were available: $*"
  return 1
}

detect_os() {
  [[ -r /etc/os-release ]] || { fail "Cannot read /etc/os-release"; exit 1; }
  # shellcheck disable=SC1091
  . /etc/os-release

  OS_ID="${ID:-unknown}"
  OS_VERSION_ID="${VERSION_ID:-unknown}"
  OS_PRETTY_NAME="${PRETTY_NAME:-unknown}"

  ok "Detected OS: ${OS_PRETTY_NAME}"
}

choose_arch() {
  local detected
  detected="$(uname -m)"

  if [[ -n "${ARCH_OVERRIDE}" ]]; then
    case "${ARCH_OVERRIDE}" in
      arm64|aarch64)
        RUNNER_ARCH="arm64"
        LABEL_ARCH="ARM64"
        ok "Using architecture override: ${RUNNER_ARCH}"
        return 0
        ;;
      x64|amd64|x86_64)
        RUNNER_ARCH="x64"
        LABEL_ARCH="X64"
        ok "Using architecture override: ${RUNNER_ARCH}"
        return 0
        ;;
      *)
        fail "Unsupported architecture override: ${ARCH_OVERRIDE}"
        fail "Use one of: arm64, x64"
        exit 1
        ;;
    esac
  fi

  case "${detected}" in
    aarch64|arm64)
      RUNNER_ARCH="arm64"
      LABEL_ARCH="ARM64"
      ;;
    x86_64|amd64)
      RUNNER_ARCH="x64"
      LABEL_ARCH="X64"
      ;;
    *)
      fail "Unsupported machine architecture: ${detected}"
      fail "Run with explicit override if needed: sudo bash $0 <RUNNER_TOKEN> [arm64|x64]"
      exit 1
      ;;
  esac

  ok "Detected machine architecture: ${detected} -> ${RUNNER_ARCH}"
}

set_runner_labels() {
  local os_label="linux"

  case "${OS_ID}" in
    ubuntu)
      os_label="ubuntu-${OS_VERSION_ID}"
      ;;
    debian|raspbian)
      os_label="${OS_ID}-${OS_VERSION_ID}"
      ;;
  esac

  RUNNER_LABELS="self-hosted,Linux,${LABEL_ARCH}"
  ok "Runner labels: ${RUNNER_LABELS}"
}

install_dependencies() {
  section "4/7  Install runner dependencies"

  export DEBIAN_FRONTEND=noninteractive
  apt-get update

  apt-get install -y \
    curl \
    tar \
    jq \
    unzip \
    ca-certificates \
    git

  case "${OS_ID}" in
    ubuntu|debian|raspbian)
      install_first_available libssl3t64 libssl3 libssl1.1 || true
      install_first_available \
        libicu76 \
        libicu74 \
        libicu72 \
        libicu71 \
        libicu70 \
        libicu69 \
        libicu68 \
        libicu67 \
        libicu66 \
        libicu65 \
        libicu63 \
        libicu60 \
        libicu57 \
        libicu55 \
        libicu52 || true
      ;;
    *)
      warn "No apt dependency map defined for OS: ${OS_ID}"
      ;;
  esac

  ok "Dependency installation step completed"
}

configure_needrestart() {
  if [[ -d /etc/needrestart/conf.d ]]; then
    echo '$nrconf{override_rc}{qr(^actions\.runner\..+\.service$)} = 0;' > /etc/needrestart/conf.d/actions_runner_services.conf
    ok "Configured needrestart to ignore GitHub runner service"
  fi
}

download_and_extract_runner() {
  section "5/7  Download and extract runner"

  mkdir -p "${RUNNER_DIR}"
  chown -R "${RUNNER_USER}:${RUNNER_USER}" "${RUNNER_DIR}"

  RUNNER_ARCHIVE="actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
  RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_ARCHIVE}"

  sudo -u "${RUNNER_USER}" bash <<EOF
set -euo pipefail
cd "${RUNNER_DIR}"

if [[ ! -f "${RUNNER_ARCHIVE}" ]]; then
  curl -fL -o "${RUNNER_ARCHIVE}" "${RUNNER_URL}"
fi

if [[ ! -f "./config.sh" ]]; then
  tar xzf "${RUNNER_ARCHIVE}"
fi
EOF

  ok "Runner package ready"
}

configure_runner() {
  section "6/7  Configure runner"

  if [[ -f "${RUNNER_DIR}/.runner" ]]; then
    warn "Runner already configured at ${RUNNER_DIR}"
    warn "Skipping config.sh because .runner already exists."
    return 0
  fi

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
}

install_and_start_service() {
  section "7/7  Install and start service"

  cd "${RUNNER_DIR}"

  if [[ -x "./bin/installdependencies.sh" ]]; then
    warn "Running bundled runner dependency helper (non-fatal if it probes missing legacy packages)"
    ./bin/installdependencies.sh || true
  fi

  if [[ -x "./svc.sh" ]]; then
    ./svc.sh install "${RUNNER_USER}"
    ./svc.sh start
    ./svc.sh status
    ok "Runner service installed and started"
  else
    fail "svc.sh not found in ${RUNNER_DIR}"
    exit 1
  fi
}

echo -e "\n${BOLD}GitHub Actions Runner Setup${RESET}"
echo -e "${DIM}Repo: ${REPO_URL}${RESET}\n"

section "1/7  Validate runner user"
id "${RUNNER_USER}" >/dev/null 2>&1 || { fail "User '${RUNNER_USER}' does not exist"; exit 1; }
ok "Detected runner user: ${RUNNER_USER}"
ok "Runner home: ${RUNNER_HOME}"

section "2/7  Detect OS"
detect_os

section "3/7  Detect runner platform"
choose_arch
set_runner_labels

install_dependencies
configure_needrestart
download_and_extract_runner
configure_runner
install_and_start_service

echo ""
ok "Runner setup complete"
echo -e "  ${DIM}Runner name: ${RUNNER_NAME}${RESET}"
echo -e "  ${DIM}Labels: ${RUNNER_LABELS}${RESET}"
echo -e "  ${DIM}Check GitHub -> Settings -> Actions -> Runners to confirm it is online.${RESET}"
