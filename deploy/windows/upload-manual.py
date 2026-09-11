"""@author zhangyueting
@date 2026-06-12
上传用户手册到服务器 nginx 静态目录 docs/，供下载。"""
import os
import posixpath
import paramiko

HOST = '192.168.18.151'
USER = 'mech-mind'
PWD = os.environ.get('TCMP_SSH_PWD', '')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REMOTE_DIR = 'C:/tcmp/manual'

FILES = ['用户手册.pdf', '用户手册.docx', '用户手册.html']


def main():
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=22, username=USER, password=PWD, timeout=20,
                look_for_keys=False, allow_agent=False)
    sftp = cli.open_sftp()
    try:
        sftp.stat(REMOTE_DIR)
    except IOError:
        sftp.mkdir(REMOTE_DIR)
    for fn in FILES:
        local = os.path.join(ROOT, fn)
        remote = posixpath.join(REMOTE_DIR, fn)
        sftp.put(local, remote)
        size = sftp.stat(remote).st_size
        print(f'UPLOADED {fn} -> {remote} ({size} bytes)')
    sftp.close()
    cli.close()
    print('DONE')


if __name__ == '__main__':
    main()
