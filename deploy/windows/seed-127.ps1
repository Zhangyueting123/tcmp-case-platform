# 127 专用：补齐内置产品线项目（幂等 seed）。127 用计划任务托管后端 + node 在 D:\Work_APP\Code_help。
# 遵守 sql.js 停服要求：停计划任务 -> 跑 seed -> 重启。
$ErrorActionPreference = 'Continue'
$root = 'C:\tcmp\app'
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'D:\Work_APP\Code_help\node.exe' }
Write-Output ('using node: ' + $node)

# 从后端启动脚本动态读取 JWT_SECRET（不硬编码密钥）
$startScript = 'C:\tcmp\start-tcmp-backend.ps1'
$secret = ''
if (Test-Path $startScript) {
  $m = Select-String -Path $startScript -Pattern "JWT_SECRET'\s*=\s*'([^']+)'" | Select-Object -First 1
  if ($m) { $secret = $m.Matches[0].Groups[1].Value }
}
if (-not $secret) { Write-Output 'WARN: JWT_SECRET not found, seed will boot without it'; } else { Write-Output 'JWT_SECRET loaded from start script' }

Write-Output '=== stopping backend task ==='
Stop-ScheduledTask -TaskName 'TCMP-Backend'
Start-Sleep -Seconds 2
$conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) { Write-Output ('killing PID ' + $c.OwningProcess); Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

Write-Output '=== running seed ==='
$env:NODE_ENV = 'production'
if ($secret) { $env:JWT_SECRET = $secret }
$env:NODE_OPTIONS = '--use-system-ca'
New-Item -ItemType Directory -Force "$root\backend\data" | Out-Null
New-Item -ItemType Directory -Force "$root\backend\data\backups" | Out-Null
Push-Location "$root\backend"
& $node 'dist\seed.js' 2>&1 | ForEach-Object { Write-Output $_ }
$code = $LASTEXITCODE
Pop-Location
Write-Output ('SEED_EXIT=' + $code)

Write-Output '=== restarting backend task ==='
Start-ScheduledTask -TaskName 'TCMP-Backend'
Start-Sleep -Seconds 6
$c2 = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($c2) { Write-Output ('LISTENING PID=' + $c2[0].OwningProcess) } else { Write-Output 'NOT_LISTENING_YET' }
Write-Output 'DONE_SEED127'
