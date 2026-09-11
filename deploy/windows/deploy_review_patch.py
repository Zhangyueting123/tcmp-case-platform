"""Deploy latest review-feature patch to TCMP Windows servers.

Steps per host: upload source zip -> build backend -> build frontend -> restart backend -> reload nginx.

Usage:
  python deploy_review_patch.py
  python deploy_review_patch.py 192.168.20.127
  TCMP_HOST=192.168.18.151 python deploy_review_patch.py

Password: env TCMP_SSH_PWD or Windows User env TCMP_SSH_PWD.
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
SKIP_DIRS = {'node_modules', 'dist', '.git', 'logs', 'tb-browser-profile', 'data', '.vscode'}
SKIP_FILES = {'tcmp-deploy.zip'}


def build_zip(path: str) -> None:
    count = 0
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(REPO):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for f in files:
                if f in SKIP_FILES:
                    continue
                full = os.path.join(root, f)
                rel = os.path.relpath(full, REPO)
                z.write(full, rel)
                count += 1
    size = os.path.getsize(path)
    print(f'zip: {count} files, {size / 1024 / 1024:.2f} MB')


def run_ps(cli: paramiko.SSHClient, ps: str, timeout: int = 900) -> int:
    enc = base64.b64encode(ps.encode('utf-16-le')).decode('ascii')
    cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + enc
    _, stdout, stderr = cli.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    rc = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print('STDERR:', err.rstrip())
    print(f'[EXIT={rc}]')
    return rc


def deploy_host(host: str, pwd: str) -> bool:
    print(f'\n========== {host} ==========')
    zip_local = os.path.join(REPO, 'tcmp-deploy.zip')
    build_zip(zip_local)

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(host, port=22, username=USER, password=pwd, timeout=30, look_for_keys=False, allow_agent=False)

    remote_zip = 'C:/Users/mech-mind/tcmp-deploy.zip'
    sftp = cli.open_sftp()
    print('uploading...')
    sftp.put(zip_local, remote_zip)
    sftp.close()
    os.remove(zip_local)
    print('uploaded')

    extract_ps = (
        '$ErrorActionPreference="Stop";'
        '$dst="C:\\tcmp\\app";'
        'New-Item -ItemType Directory -Force $dst | Out-Null;'
        'Expand-Archive -Path "C:\\Users\\mech-mind\\tcmp-deploy.zip" -DestinationPath $dst -Force;'
        'Write-Output "EXTRACT_OK"'
    )
    if run_ps(cli, extract_ps, 300) != 0:
        cli.close()
        return False

    backend_ps = open(os.path.join(REPO, 'deploy', 'windows', 'step-build-backend.ps1'), 'r', encoding='utf-8').read()
    if run_ps(cli, backend_ps, 1200) != 0:
        cli.close()
        return False

    frontend_ps = open(os.path.join(REPO, 'deploy', 'windows', 'install-build-frontend.ps1'), 'r', encoding='utf-8').read()
    if run_ps(cli, frontend_ps, 1200) != 0:
        cli.close()
        return False

    restart_ps = open(os.path.join(REPO, 'deploy', 'windows', 'restart-backend-task.ps1'), 'r', encoding='utf-8').read()
    if run_ps(cli, restart_ps, 120) != 0:
        cli.close()
        return False

    verify_ps = (
        '$ErrorActionPreference="SilentlyContinue";'
        'Start-Sleep -Seconds 3;'
        '$c=Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue;'
        'if($c){"BACKEND_LISTENING"}else{"BACKEND_DOWN"};'
        '$r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1/ -TimeoutSec 10;'
        'Write-Output ("FRONT_STATUS="+$r.StatusCode);'
        'if(Test-Path "C:\\tcmp\\app\\frontend\\dist\\assets\\ReviewDetail-*.js"){'
        '  Get-ChildItem "C:\\tcmp\\app\\frontend\\dist\\assets\\ReviewDetail-*.js" | Select-Object -First 1 -ExpandProperty Name'
        '}'
    )
    run_ps(cli, verify_ps, 60)

    reload_ps = (
        '$ErrorActionPreference="SilentlyContinue";'
        'if(Test-Path "C:\\nginx\\nginx.exe"){'
        '  Push-Location C:\\nginx;'
        '  $p=Get-Process nginx -ErrorAction SilentlyContinue;'
        '  if($p){& .\\nginx.exe -s reload}else{Start-Process .\\nginx.exe};'
        '  Pop-Location;'
        '  "NGINX_RELOADED"'
        '}else{"NGINX_MISSING"}'
    )
    run_ps(cli, reload_ps, 30)
    cli.close()
    print(f'DONE {host}')
    return True


def main() -> int:
    pwd = ssh_password()
    if not pwd:
        print('ERROR: TCMP_SSH_PWD not set (process env or Windows User env).')
        return 1
    hosts = sys.argv[1:] if len(sys.argv) > 1 else HOSTS
    ok = True
    for h in hosts:
        if not deploy_host(h, pwd):
            ok = False
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
