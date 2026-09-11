"""Shared SSH helpers for Windows deployment scripts."""
import os
import subprocess


def _read_user_env(name: str) -> str:
    try:
        r = subprocess.run(
            [
                'powershell',
                '-NoProfile',
                '-Command',
                f"[Environment]::GetEnvironmentVariable('{name}','User')",
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        return (r.stdout or '').strip()
    except Exception:
        return ''


def ssh_password(host: str | None = None) -> str:
    """Read SSH password. Per-host env: TCMP_SSH_PWD_151, TCMP_SSH_PWD_201127, TCMP_SSH_PWD_127, etc."""
    if host:
        host_key = host.replace('.', '_')
        candidates = [
            f'TCMP_SSH_PWD_{host_key}',
            f'TCMP_SSH_PWD_{host.split(".")[-1]}',
        ]
        # legacy alias used for 192.168.20.127
        if host == '192.168.20.127':
            candidates.insert(0, 'TCMP_SSH_PWD_201127')
        for name in candidates:
            pwd = _read_user_env(name) or (os.environ.get(name) or '').strip()
            if pwd:
                return pwd
    pwd = _read_user_env('TCMP_SSH_PWD') or (os.environ.get('TCMP_SSH_PWD') or '').strip()
    return pwd

