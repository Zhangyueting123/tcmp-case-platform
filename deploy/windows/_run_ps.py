"""Upload a local .ps1 to .151 and run it via powershell -File, streaming output.
Usage: python _run_ps.py <local_ps1_path>
Password via env TCMP_SSH_PWD."""
import os
import sys
import paramiko

from _ssh_util import ssh_password

HOST = os.environ.get('TCMP_HOST', '192.168.18.151')
USER = 'mech-mind'
PWD = ssh_password()
REMOTE_PS = 'C:/Users/mech-mind/_tcmp_step.ps1'


def main():
    local = sys.argv[1]
    timeout = int(os.environ.get('TCMP_SSH_TIMEOUT', '900'))
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=22, username=USER, password=PWD, timeout=20,
                look_for_keys=False, allow_agent=False)
    sftp = cli.open_sftp()
    # upload as UTF-8 with BOM so PowerShell reads any non-ASCII correctly
    with open(local, 'rb') as f:
        data = f.read()
    if not data.startswith(b'\xef\xbb\xbf'):
        data = b'\xef\xbb\xbf' + data
    with sftp.open(REMOTE_PS, 'wb') as rf:
        rf.write(data)
    sftp.close()

    cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\\Users\\mech-mind\\_tcmp_step.ps1"'
    stdin, stdout, stderr = cli.exec_command(cmd, timeout=timeout, get_pty=False)
    chan = stdout.channel
    chan.settimeout(timeout)
    out_bytes = b''
    while True:
        try:
            data = chan.recv(8192)
        except Exception:
            break
        if not data:
            break
        out_bytes += data
    rc = chan.recv_exit_status()
    sys.stdout.write(out_bytes.decode('utf-8', 'replace'))
    err = stderr.read().decode('utf-8', 'replace')
    if err.strip():
        sys.stderr.write('\n--- STDERR ---\n' + err)
    print(f'\n[EXIT={rc}]')
    cli.close()
    sys.exit(0 if rc == 0 else rc)


if __name__ == '__main__':
    main()
