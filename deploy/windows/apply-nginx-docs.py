"""@author zhangyueting
@date 2026-06-12
上传新的 nginx.conf 到服务器，测试配置，清理 dist/docs 旧文件，重载 nginx。"""
import os
import paramiko

HOST = '192.168.18.151'
USER = 'mech-mind'
PWD = os.environ.get('TCMP_SSH_PWD', '')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOCAL_CONF = os.path.join(ROOT, 'deploy', 'windows', 'nginx.conf')
REMOTE_CONF = 'C:/nginx/conf/nginx.conf'


def run(cli, cmd):
    stdin, stdout, stderr = cli.exec_command(cmd, timeout=120)
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    rc = stdout.channel.recv_exit_status()
    return rc, out, err


def main():
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=22, username=USER, password=PWD, timeout=20,
                look_for_keys=False, allow_agent=False)

    # backup + upload conf
    sftp = cli.open_sftp()
    sftp.put(LOCAL_CONF, REMOTE_CONF)
    print('CONF UPLOADED')
    sftp.close()

    # test config
    rc, out, err = run(cli, 'cmd /c "cd /d C:\\nginx && nginx.exe -t"')
    print('NGINX_TEST_RC', rc)
    print((out + err).strip()[-400:])

    if rc != 0:
        print('CONFIG TEST FAILED, abort reload')
        cli.close()
        return

    # remove old dist/docs files
    rc2, _, _ = run(cli, 'cmd /c "if exist C:\\tcmp\\app\\frontend\\dist\\docs rmdir /s /q C:\\tcmp\\app\\frontend\\dist\\docs"')
    print('CLEAN_DIST_DOCS_RC', rc2)

    # reload nginx
    rc3, out3, err3 = run(cli, 'cmd /c "cd /d C:\\nginx && nginx.exe -s reload"')
    print('NGINX_RELOAD_RC', rc3)
    if (out3 + err3).strip():
        print((out3 + err3).strip()[-300:])

    cli.close()
    print('DONE')


if __name__ == '__main__':
    main()
