#!/usr/bin/env python3

import filecmp
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
APP_ROOT = Path("/opt/otp-relay")
SYSTEMD_DIR = Path("/etc/systemd/system")
NGINX_TEMPLATE_DEST = APP_ROOT / "nginx" / "otp-relay.conf.template"
NGINX_RENDERED_DEST = Path("/etc/nginx/sites-available/otp-relay")

SHELL_FILES = [
    "install.sh",
    "update.sh",
    "deploy_users.sh",
]

SERVICE_FILES = [
    "systemd/otp-relay.service",
    "systemd/otp-monitor.service",
]

NGINX_FILES = [
    "nginx/otp-relay.conf.template",
]


def ts():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def log(msg):
    print(f"[{ts()}] {msg}", flush=True)


def fail(msg, code=1):
    log(f"ERROR: {msg}")
    sys.exit(code)


def run(cmd, check=True):
    log(f"RUN: {' '.join(cmd)}")
    subprocess.run(cmd, check=check)


def run_capture(cmd):
    log(f"RUN: {' '.join(cmd)}")
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def file_changed(src: Path, dst: Path) -> bool:
    if not dst.exists():
        return True
    return not filecmp.cmp(src, dst, shallow=False)


def validate_shell_script(path: Path):
    log(f"Validating shell script: {path}")
    run(["bash", "-n", str(path)])


def ensure_parent(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)


def copy_file(src: Path, dst: Path, chmod_mode=None):
    ensure_parent(dst)
    shutil.copy2(src, dst)
    if chmod_mode is not None:
        os.chmod(dst, chmod_mode)
    log(f"Copied: {src} -> {dst}")


def copy_with_sudo(src: Path, dst: Path):
    run(["sudo", "-n", "install", "-m", "0644", str(src), str(dst)])


def copy_executable_with_sudo(src: Path, dst: Path):
    run(["sudo", "-n", "install", "-m", "0755", str(src), str(dst)])


def render_nginx_template():
    if not NGINX_TEMPLATE_DEST.exists():
        fail(f"Nginx template not found at {NGINX_TEMPLATE_DEST}")

    cmd = (
        f"set -euo pipefail; "
        f"source /opt/otp-relay/.env; "
        f"export SERVER_HOSTNAME SERVER_IP; "
        f"envsubst '${{SERVER_HOSTNAME}} ${{SERVER_IP}}' "
        f"< {NGINX_TEMPLATE_DEST} "
        f"> /tmp/otp-relay.nginx.rendered; "
        f"sudo -n install -m 0644 /tmp/otp-relay.nginx.rendered {NGINX_RENDERED_DEST}; "
        f"rm -f /tmp/otp-relay.nginx.rendered"
    )
    run(["bash", "-lc", cmd])


def validate_nginx():
    run(["sudo", "-n", "nginx", "-t"])


def reload_nginx():
    run(["sudo", "-n", "systemctl", "reload", "nginx"])


def daemon_reload():
    run(["sudo", "-n", "systemctl", "daemon-reload"])


def restart_service(service_name: str):
    run(["sudo", "-n", "systemctl", "restart", service_name])
    run(["sudo", "-n", "systemctl", "is-active", "--quiet", service_name])
    log(f"Service is active: {service_name}")


def main():
    changed_shell = []
    changed_services = []
    changed_nginx = []

    log("Starting Phase 3 server config deployment")

    # Validate shell scripts first
    for rel in SHELL_FILES:
        src = REPO_ROOT / rel
        if not src.exists():
            fail(f"Missing source file: {src}")
        validate_shell_script(src)

    # Detect changed shell files
    for rel in SHELL_FILES:
        src = REPO_ROOT / rel
        dst = APP_ROOT / rel
        if file_changed(src, dst):
            changed_shell.append((src, dst))

    # Detect changed systemd files
    for rel in SERVICE_FILES:
        src = REPO_ROOT / rel
        dst = SYSTEMD_DIR / Path(rel).name
        if not src.exists():
            fail(f"Missing source file: {src}")
        if file_changed(src, dst):
            changed_services.append((src, dst))

    # Detect changed nginx template
    for rel in NGINX_FILES:
        src = REPO_ROOT / rel
        dst = APP_ROOT / rel
        if not src.exists():
            fail(f"Missing source file: {src}")
        if file_changed(src, dst):
            changed_nginx.append((src, dst))

    if not changed_shell and not changed_services and not changed_nginx:
        log("No server config changes detected. Nothing to do.")
        return

    if changed_shell:
        log("Changed shell files:")
        for src, _ in changed_shell:
            log(f" - {src.relative_to(REPO_ROOT)}")

    if changed_services:
        log("Changed service files:")
        for src, _ in changed_services:
            log(f" - {src.relative_to(REPO_ROOT)}")

    if changed_nginx:
        log("Changed nginx files:")
        for src, _ in changed_nginx:
            log(f" - {src.relative_to(REPO_ROOT)}")

    # Deploy shell files
    for src, dst in changed_shell:
        copy_executable_with_sudo(src, dst)

    # Deploy systemd unit files
    services_to_restart = []
    if changed_services:
        for src, dst in changed_services:
            copy_with_sudo(src, dst)
            services_to_restart.append(dst.name)

        daemon_reload()

    # Deploy nginx template and reload if needed
    if changed_nginx:
        for src, dst in changed_nginx:
            copy_executable_with_sudo(src, dst) if src.name.endswith(".sh") else copy_with_sudo(src, dst)

        render_nginx_template()
        validate_nginx()
        reload_nginx()
        log("Nginx configuration reloaded successfully")

    # Restart only changed services
    if services_to_restart:
        log("Restarting changed services:")
        for svc in services_to_restart:
            log(f" - {svc}")
            restart_service(svc)

    log("Phase 3 server config deployment completed successfully")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        fail(f"Command failed with exit code {e.returncode}: {' '.join(e.cmd)}")
    except Exception as e:
        fail(str(e))
