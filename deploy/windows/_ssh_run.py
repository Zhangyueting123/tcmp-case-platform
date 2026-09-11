"""SSH command runner for .151. Usage:
  python _ssh_run.py "<remote command>"          # run one command
  python _ssh_run.py @path\\to\\file.txt           # run script file content via cmd
Password via env TCMP_SSH_PWD.
"""
import os
import sys
import paramiko

from _ssh_util import ssh_password

HOST = os.environ.get('TCMP_HOST', '192.168.18.151')
USER = 'mech-mind'
PWD = ssh_password()


def connect():
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=22, username=USER, password=PWD, timeout=20,
                look_for_keys=False, allow_agent=False)
    return cli


def main():
    if len(sys.argv) < 2:
        print('no command')
        sys.exit(1)
    cmd = sys.argv[1]
    timeout = int(os.environ.get('TCMP_SSH_TIMEOUT', '600'))
    cli = connect()
    stdin, stdout, stderr = cli.exec_command(cmd, timeout=timeout, get_pty=False)
    # stream output
    for line in iter(stdout.readline, ''):
        sys.stdout.write(line)
        sys.stdout.flush()
    rc = stdout.channel.recv_exit_status()
    err = stderr.read().decode('utf-8', 'ignore')
    if err.strip():
        sys.stderr.write('\n--- STDERR ---\n' + err)
    print(f'\n[EXIT={rc}]')
    cli.close()
    sys.exit(0 if rc == 0 else rc)


if __name__ == '__main__':
    main()
