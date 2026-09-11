# TCMP 后端健康检查：3000 未监听则重启 TCMP-Backend 计划任务
$ErrorActionPreference = 'SilentlyContinue'
$log = 'C:\tcmp\app\backend\logs\watchdog.log'
$logDir = Split-Path $log -Parent
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force $logDir | Out-Null }

function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -Path $log -Value $line
}

$listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listening) { exit 0 }

Write-Log 'Backend not listening on 3000, restarting TCMP-Backend...'
Stop-ScheduledTask -TaskName 'TCMP-Backend' -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
foreach ($c in (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
  Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 1
Start-ScheduledTask -TaskName 'TCMP-Backend'
Start-Sleep -Seconds 10

$listening2 = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listening2) {
  Write-Log ("Restart OK PID=" + $listening2[0].OwningProcess)
} else {
  Write-Log 'Restart FAILED: still not listening on 3000'
  exit 1
}
