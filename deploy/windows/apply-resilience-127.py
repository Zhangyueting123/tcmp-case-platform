"""Upload resilience scripts to 192.168.20.127 and apply (admin required on remote)."""
from __future__ import annotations

import base64
import os
import sys

import paramiko

from _ssh_util import ssh_password

HOST = '192.168.20.127'
USER = 'mech-mind'
REMOTE_DIR = 'C:/Users/mech-mind/_tcmp_resilience'
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def run_ps(cli: paramiko.SSHClient, ps: str, timeout: int = 180) -> int:
    enc = base64.b64encode(ps.encode('utf-16-le')).decode('ascii')
    cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + enc
    _, stdout, stderr = cli.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    rc = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip() and not err.strip().startswith('#< CLIXML'):
        print('STDERR:', err.rstrip())
    print(f'[EXIT={rc}]')
    return rc


def main() -> int:
    pwd = ssh_password(HOST)
    if not pwd:
        print('ERROR: set TCMP_SSH_PWD_201127')
        return 1

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, 22, USER, pwd, timeout=30, look_for_keys=False, allow_agent=False)

    sftp = cli.open_sftp()
    try:
        sftp.mkdir(REMOTE_DIR)
    except OSError:
        pass
    for name in ('watchdog-tcmp-backend.ps1', 'setup-backend-resilience-127.ps1'):
        local = os.path.join(SCRIPT_DIR, name)
        remote = REMOTE_DIR + '/' + name
        print(f'upload {name}')
        sftp.put(local, remote)
    sftp.close()

    apply_ps = rf"""
$ErrorActionPreference = 'Stop'
$dir = '{REMOTE_DIR.replace('/', '\\')}'
$setup = Join-Path $dir 'setup-backend-resilience-127.ps1'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Output ('IS_ADMIN=' + $isAdmin)
if (-not $isAdmin) {{
  Write-Output 'Elevating to Administrator...'
  Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$setup)
}} else {{
  & $setup
}}
"""
    rc = run_ps(cli, apply_ps, 240)
    cli.close()
    return rc


if __name__ == '__main__':
    sys.exit(main())
