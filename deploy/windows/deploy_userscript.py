"""Upload backend/scripts/tcmp-tb-filler.user.js to the servers.

The /tb-filler/userscript endpoint reads the file from disk on every request,
so no rebuild and no backend restart are needed -- copying the file is enough.

Usage: python deploy/windows/deploy_userscript.py [host ...]
Password via env TCMP_SSH_PWD_201127 (127) / TCMP_SSH_PWD (151).
"""
import base64
import os
import sys

import paramiko

from _ssh_util import ssh_password

REPO = r'd:\用例管理平台'
USER = 'mech-mind'
HOSTS = ['192.168.20.127', '192.168.18.151']

REL = 'backend/scripts/tcmp-tb-filler.user.js'
REMOTE = 'C:/tcmp/app/backend/scripts/tcmp-tb-filler.user.js'


def safe_print(text: str) -> None:
    enc = getattr(sys.stdout, 'encoding', None) or 'utf-8'
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode(enc, errors='replace').decode(enc))


def run_ps(cli: paramiko.SSHClient, ps: str, timeout: int = 60) -> int:
    enc = base64.b64encode(ps.encode('utf-16-le')).decode('ascii')
    _, stdout, stderr = cli.exec_command(
        'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + enc, timeout=timeout)
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    rc = stdout.channel.recv_exit_status()
    if out.strip():
        safe_print(out.rstrip())
    if err.strip() and not err.strip().startswith('#< CLIXML'):
        safe_print('STDERR: ' + err.rstrip())
    return rc


def deploy_host(host: str, pwd: str, local: str) -> bool:
    print(f'\n========== {host} ==========')
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        cli.connect(host, port=22, username=USER, password=pwd, timeout=30,
                    look_for_keys=False, allow_agent=False)
    except paramiko.AuthenticationException:
        print(f'ERROR: SSH authentication failed for {USER}@{host}')
        return False

    sftp = cli.open_sftp()
    sftp.put(local, REMOTE)
    sftp.close()
    print(f'uploaded -> {REMOTE}')

    # Verify through the real chain: nginx -> backend -> file on disk
    verify_ps = (
        '$ErrorActionPreference="Stop";'
        '$r=Invoke-WebRequest -UseBasicParsing '
        'http://127.0.0.1/api/v1/tb-filler/userscript -TimeoutSec 15;'
        '"HTTP="+$r.StatusCode;'
        '($r.Content -split "`n" | Select-String "@version|@updateURL").Line.Trim()'
    )
    ok = run_ps(cli, verify_ps) == 0
    cli.close()
    return ok


def main() -> int:
    local = os.path.join(REPO, *REL.split('/'))
    if not os.path.isfile(local):
        print(f'ERROR: missing {local}')
        return 1

    hosts = sys.argv[1:] or HOSTS
    ok = True
    for h in hosts:
        pwd = ssh_password(h)
        if not pwd:
            print(f'ERROR: no SSH password for {h}.')
            print('Set TCMP_SSH_PWD_201127 for 192.168.20.127, or TCMP_SSH_PWD for 192.168.18.151')
            ok = False
            continue
        if not deploy_host(h, pwd, local):
            ok = False
    print('\nALL DONE' if ok else '\nFINISHED WITH ERRORS')
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
