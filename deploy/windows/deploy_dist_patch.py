"""Deploy pre-built dist artifacts (no remote npm build).

Uploads backend/dist + frontend/dist to Windows TCMP servers and restarts backend.

Requires: TCMP_SSH_PWD in Windows User environment (or process env).
"""
from __future__ import annotations

import base64
import os
import sys
import zipfile

import paramiko

from _ssh_util import ssh_password

REPO = r'd:\用例管理平台'
USER = 'mech-mind'
HOSTS = ['192.168.20.127', '192.168.18.151']


def safe_print(text: str) -> None:
    """Print without crashing on Windows GBK consoles."""
    enc = getattr(sys.stdout, 'encoding', None) or 'utf-8'
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode(enc, errors='replace').decode(enc))


def build_dist_zip(path: str) -> None:
    pairs = [
        (os.path.join(REPO, 'backend', 'dist'), 'backend/dist'),
        (os.path.join(REPO, 'frontend', 'dist'), 'frontend/dist'),
    ]
    count = 0
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for src, arc_prefix in pairs:
            if not os.path.isdir(src):
                raise FileNotFoundError(f'missing build output: {src}')
            for root, _, files in os.walk(src):
                for f in files:
                    full = os.path.join(root, f)
                    rel = os.path.relpath(full, src)
                    z.write(full, f'{arc_prefix}/{rel}'.replace('\\', '/'))
                    count += 1
    print(f'dist zip: {count} files, {os.path.getsize(path) / 1024 / 1024:.2f} MB')


def run_ps(cli: paramiko.SSHClient, ps: str, timeout: int = 300) -> int:
    enc = base64.b64encode(ps.encode('utf-16-le')).decode('ascii')
    cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + enc
    _, stdout, stderr = cli.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    rc = stdout.channel.recv_exit_status()
    if out.strip():
        safe_print(out.rstrip())
    if err.strip() and not err.strip().startswith('#< CLIXML'):
        safe_print('STDERR: ' + err.rstrip())
    safe_print(f'[EXIT={rc}]')
    return rc


def deploy_host(host: str, pwd: str) -> bool:
    print(f'\n========== {host} ==========')
    zip_local = os.path.join(REPO, 'tcmp-dist-patch.zip')
    build_dist_zip(zip_local)

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        cli.connect(host, port=22, username=USER, password=pwd, timeout=30, look_for_keys=False, allow_agent=False)
    except paramiko.AuthenticationException:
        print(f'ERROR: SSH authentication failed for {USER}@{host}')
        print('Please set TCMP_SSH_PWD_201127 (for 127) or TCMP_SSH_PWD (for 151), then retry.')
        return False

    remote_zip = 'C:/Users/mech-mind/tcmp-dist-patch.zip'
    sftp = cli.open_sftp()
    print('uploading dist patch...')
    sftp.put(zip_local, remote_zip)
    sftp.close()
    os.remove(zip_local)

    deploy_ps = r'''
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = 'C:\tcmp\app'
$zip = 'C:\Users\mech-mind\tcmp-dist-patch.zip'
$tmp = 'C:\Users\mech-mind\_tcmp_dist_patch'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Force $tmp | Out-Null
Expand-Archive -Path $zip -DestinationPath $tmp -Force
Copy-Item -Path "$tmp\backend\dist\*" -Destination "$root\backend\dist" -Recurse -Force
Copy-Item -Path "$tmp\frontend\dist\*" -Destination "$root\frontend\dist" -Recurse -Force
Remove-Item $tmp -Recurse -Force
Write-Output 'DIST_COPIED'
Get-ChildItem "$root\frontend\dist\assets\ReviewDetail-*.js" | Select-Object -First 1 -ExpandProperty Name
'''
    if run_ps(cli, deploy_ps, 120) != 0:
        cli.close()
        return False

    restart_ps = open(os.path.join(REPO, 'deploy', 'windows', 'restart-backend-task.ps1'), 'r', encoding='utf-8').read()
    if run_ps(cli, restart_ps, 120) != 0:
        cli.close()
        return False

    verify_ps = (
        '$ErrorActionPreference="SilentlyContinue";'
        'Start-Sleep -Seconds 4;'
        '$c=Get-NetTCPConnection -LocalPort 3000 -State Listen;'
        'if($c){"BACKEND_OK"}else{"BACKEND_DOWN"};'
        '$r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1/ -TimeoutSec 10;'
        '"FRONT="+$r.StatusCode'
    )
    run_ps(cli, verify_ps, 30)

    reload_ps = (
        'if(Test-Path "C:\\nginx\\nginx.exe"){'
        'Push-Location C:\\nginx;'
        '$p=Get-Process nginx -ErrorAction SilentlyContinue;'
        'if($p){& .\\nginx.exe -s reload}else{Start-Process .\\nginx.exe};'
        'Pop-Location;"NGINX_OK"}else{"NGINX_SKIP"}'
    )
    run_ps(cli, reload_ps, 30)
    cli.close()
    print(f'DONE {host}')
    return True


def main() -> int:
    hosts = sys.argv[1:] if len(sys.argv) > 1 else HOSTS
    ok = True
    for h in hosts:
        pwd = ssh_password(h)
        if not pwd:
            print(f'ERROR: no SSH password for {h}.')
            print('Set TCMP_SSH_PWD_201127 for 192.168.20.127, or TCMP_SSH_PWD for 192.168.18.151')
            ok = False
            continue
        print(f'SSH password loaded for {h} (length={len(pwd)})')
        if not deploy_host(h, pwd):
            ok = False
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
