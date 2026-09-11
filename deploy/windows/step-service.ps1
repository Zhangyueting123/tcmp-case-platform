$ErrorActionPreference = 'Stop'
$root = 'C:\tcmp\app'
$backend = "$root\backend"
$node = 'C:\Program Files\nodejs\node.exe'
$svc = 'TCMP-Backend'
$secret = (Get-Content 'C:\tcmp\jwt_secret.txt' -Raw).Trim()

# 是否以管理员权限运行
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
Write-Output ("elevated=" + $isAdmin)

# 1) 定位 winget 安装的真实 nssm.exe（避免使用会被清理的 shim）
$nssm = $null
$cand = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter 'nssm.exe' -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match 'win64' } | Select-Object -First 1
if ($cand) { $nssm = $cand.FullName }
if (-not $nssm) {
  $shim = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\nssm.exe"
  if (Test-Path $shim) { $nssm = $shim }
}
if (-not $nssm) { throw 'nssm.exe not found after winget install' }
# 复制到固定位置，避免将来 winget 升级路径变化导致服务失效
Copy-Item $nssm 'C:\tcmp\nssm.exe' -Force
$nssm = 'C:\tcmp\nssm.exe'
Write-Output ("nssm at " + $nssm)

New-Item -ItemType Directory -Force "$backend\logs" | Out-Null

# 2) 删除旧服务（若有）
if (Get-Service $svc -ErrorAction SilentlyContinue) {
  & $nssm stop $svc 2>&1 | Out-Null
  Start-Sleep -Seconds 2
  & $nssm remove $svc confirm 2>&1 | Out-Null
  Start-Sleep -Seconds 2
  Write-Output "removed existing service"
}

# 3) 安装并配置
& $nssm install $svc $node 'dist\main.js'
& $nssm set $svc AppDirectory $backend
& $nssm set $svc AppEnvironmentExtra "NODE_ENV=production" "PORT=3000" "JWT_SECRET=$secret"
& $nssm set $svc Start SERVICE_AUTO_START
& $nssm set $svc AppStdout "$backend\logs\service.out.log"
& $nssm set $svc AppStderr "$backend\logs\service.err.log"
& $nssm set $svc AppRotateFiles 1
& $nssm set $svc AppRotateBytes 10485760

# 4) 启动
& $nssm start $svc
Start-Sleep -Seconds 4
$status = (& $nssm status $svc)
Write-Output ("service status: " + $status)

# 5) 健康检查
try {
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:3000/api/v1/auth/login' -ContentType 'application/json' -Body '{}' -TimeoutSec 10 | Out-Null
} catch {
  $sc = $_.Exception.Response.StatusCode.value__
  Write-Output ("backend HTTP responded: " + $sc)
}
Write-Output "SERVICE_DONE"
