# 127 专用：配置 TCMP-Backend 计划任务 + 健康检查 Watchdog
# 需管理员 PowerShell 运行（Register-ScheduledTask 写 SYSTEM 任务）
#requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$BackendStartScript = 'C:\tcmp\start-tcmp-backend.ps1'
$WatchdogScript = 'C:\tcmp\watchdog-tcmp-backend.ps1'
$RepoWatchdog = Join-Path $PSScriptRoot 'watchdog-tcmp-backend.ps1'

if (-not (Test-Path $BackendStartScript)) {
  throw "Missing $BackendStartScript"
}
if (-not (Test-Path $RepoWatchdog)) {
  throw "Missing $RepoWatchdog"
}

Copy-Item -Path $RepoWatchdog -Destination $WatchdogScript -Force
Write-Output "Watchdog script -> $WatchdogScript"

# --- TCMP-Backend：开机自启 + 失败重试 + 错过启动则补跑 ---
$backendAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$BackendStartScript`""
$backendTrigger = New-ScheduledTaskTrigger -AtStartup
$backendTrigger.Delay = 'PT30S'
$backendSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew
$backendPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
  -TaskName 'TCMP-Backend' `
  -Action $backendAction `
  -Trigger $backendTrigger `
  -Settings $backendSettings `
  -Principal $backendPrincipal `
  -Force | Out-Null
Write-Output 'TCMP-Backend: AtStartup(+30s), StartWhenAvailable, RestartCount=999'

# --- TCMP-Backend-Watchdog：每 3 分钟探测 3000，挂了自动拉起 ---
$watchdogAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$WatchdogScript`""
$watchdogTriggerBoot = New-ScheduledTaskTrigger -AtStartup
$watchdogTriggerBoot.Delay = 'PT2M'
$watchdogTriggerRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date).Date `
  -RepetitionInterval (New-TimeSpan -Minutes 3) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$watchdogSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
  -MultipleInstances IgnoreNew
$watchdogPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
  -TaskName 'TCMP-Backend-Watchdog' `
  -Action $watchdogAction `
  -Trigger @($watchdogTriggerBoot, $watchdogTriggerRepeat) `
  -Settings $watchdogSettings `
  -Principal $watchdogPrincipal `
  -Force | Out-Null
Write-Output 'TCMP-Backend-Watchdog: every 3 min + AtStartup(+2m)'

# 立即跑一次 watchdog 验证
Start-ScheduledTask -TaskName 'TCMP-Backend-Watchdog'
Start-Sleep -Seconds 12
$listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  Write-Output ('VERIFY OK PID=' + $listening[0].OwningProcess)
} else {
  Write-Output 'VERIFY WARN: port 3000 not listening yet'
}
Write-Output 'DONE_RESILIENCE_127'
