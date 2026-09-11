"""Package project source into a zip (excluding heavy/unwanted dirs) and SFTP it to .151, then extract.
Password via env TCMP_SSH_PWD."""
import os
import sys
import zipfile
import paramiko

from _ssh_util import ssh_password

HOST = os.environ.get('TCMP_HOST', '192.168.18.151')
USER = 'mech-mind'
PWD = ssh_password()

REPO = r'd:\用例管理平台'
ZIP_LOCAL = os.path.join(REPO, 'tcmp-deploy.zip')

# Directory names to skip anywhere in the tree
SKIP_DIRS = {'node_modules', 'dist', '.git', 'logs', 'tb-browser-profile', 'data', '.vscode'}
# File names to skip
SKIP_FILES = {'tcmp-deploy.zip'}


def build_zip():
    count = 0
    with zipfile.ZipFile(ZIP_LOCAL, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(REPO):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for f in files:
                if f in SKIP_FILES:
                    continue
                full = os.path.join(root, f)
                rel = os.path.relpath(full, REPO)
                z.write(full, rel)
                count += 1
    size = os.path.getsize(ZIP_LOCAL)
    print(f'zip built: {count} files, {size/1024/1024:.2f} MB')
    return count


def main():
    n = build_zip()
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=22, username=USER, password=PWD, timeout=20,
                look_for_keys=False, allow_agent=False)

    remote_zip = 'C:/Users/mech-mind/tcmp-deploy.zip'
    sftp = cli.open_sftp()
    print('uploading...')
    sftp.put(ZIP_LOCAL, remote_zip)
    print('uploaded to', remote_zip)
    sftp.close()

    # Extract on server (clean target dir of code but we excluded data anyway)
    ps = (
        '$ErrorActionPreference="Stop";'
        '$dst="C:\\tcmp\\app";'
        'New-Item -ItemType Directory -Force $dst | Out-Null;'
        'Expand-Archive -Path "C:\\Users\\mech-mind\\tcmp-deploy.zip" -DestinationPath $dst -Force;'
        'Write-Output ("extracted to " + $dst);'
        'Get-ChildItem $dst | Select-Object -ExpandProperty Name'
    )
    import base64
    enc = base64.b64encode(ps.encode('utf-16-le')).decode('ascii')
    cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + enc
    stdin, stdout, stderr = cli.exec_command(cmd, timeout=300)
    print(stdout.read().decode('utf-8', 'ignore'))
    err = stderr.read().decode('utf-8', 'ignore')
    if err.strip():
        print('STDERR:', err)
    cli.close()
    # cleanup local zip
    os.remove(ZIP_LOCAL)
    print('local zip removed')


if __name__ == '__main__':
    main()
