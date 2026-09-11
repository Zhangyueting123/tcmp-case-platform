$ErrorActionPreference = 'Continue'
$nginxDir = 'C:\nginx'
$nssm = 'C:\tcmp\nssm.exe'
$svc = 'TCMP-Nginx'

# 停掉手动启动的 nginx，交给服务接管
Push-Location $nginxDir
& "$nginxDir\nginx.exe" -s stop 2>&1 | Out-Null
Pop-Location
Start-Sleep -Seconds 2
Get-Process nginx -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 删除旧服务（若有）
if (Get-Service $svc -ErrorAction SilentlyContinue) {
  & $nssm stop $svc 2>&1 | Out-Null
  Start-Sleep -Seconds 2
  & $nssm remove $svc confirm 2>&1 | Out-Null
  Start-Sleep -Seconds 2
}

# 注册 nginx 为服务（开机自启）
& $nssm install $svc "$nginxDir\nginx.exe" 2>&1 | Out-Null
& $nssm set $svc AppDirectory $nginxDir 2>&1 | Out-Null
& $nssm set $svc Start SERVICE_AUTO_START 2>&1 | Out-Null
# nginx 在前台运行 master，NSSM 直接监管；停止时杀进程树
& $nssm set $svc AppStopMethodConsole 0 2>&1 | Out-Null
& $nssm start $svc 2>&1 | Out-Null
Start-Sleep -Seconds 3

$status = (& $nssm status $svc)
Write-Output ("nginx service status: " + $status)
$proc = Get-Process nginx -ErrorAction SilentlyContinue
Write-Output ("nginx processes: " + (@($proc).Count))
Write-Output "NGINX_SERVICE_DONE"
