# ============================================================
# TCMP Windows 部署 - 步骤2：把后端注册为 Windows 服务（NSSM）
# 必须以【管理员】身份运行 PowerShell。
# 作用：开机自启、崩溃自动拉起，并以“进程环境变量”方式安全注入 JWT_SECRET。
# 注意：本项目的 JWT_SECRET 必须走真正的环境变量，.env 文件对它不生效。
# ============================================================
#requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$RepoRoot    = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ServiceName = 'TCMP-Backend'
$BackendDir  = "$RepoRoot\backend"
$NodeExe     = (Get-Command node -ErrorAction Stop).Source

if (-not (Test-Path "$BackendDir\dist\main.js")) {
  throw "Not built yet. Run 1-build.ps1 first."
}

# --- 1) 准备 NSSM（优先用 PATH 中的 nssm，否则尝试下载到本目录） ---
$nssmCmd = Get-Command nssm -ErrorAction SilentlyContinue
if ($nssmCmd) {
  $NssmExe = $nssmCmd.Source
} else {
  $NssmExe = Join-Path $PSScriptRoot 'nssm.exe'
  if (-not (Test-Path $NssmExe)) {
    Write-Host "nssm not found, downloading from nssm.cc ..."
    $zip = Join-Path $env:TEMP 'nssm.zip'
    Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath (Join-Path $env:TEMP 'nssm') -Force
    Copy-Item (Join-Path $env:TEMP 'nssm\nssm-2.24\win64\nssm.exe') $NssmExe -Force
  }
}
Write-Host "Using NSSM: $NssmExe"

# --- 2) 生成强随机 JWT_SECRET（hex，无特殊字符，避免参数解析问题） ---
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$JwtSecret = -join ($bytes | ForEach-Object { $_.ToString('x2') })

# --- 3) 移除旧服务（若存在） ---
& $NssmExe stop   $ServiceName 2>$null | Out-Null
& $NssmExe remove $ServiceName confirm 2>$null | Out-Null

# --- 4) 安装并配置服务 ---
New-Item -ItemType Directory -Force "$BackendDir\logs" | Out-Null
& $NssmExe install $ServiceName $NodeExe 'dist\main.js'
& $NssmExe set $ServiceName AppDirectory $BackendDir
& $NssmExe set $ServiceName AppEnvironmentExtra "NODE_ENV=production" "PORT=3000" "JWT_SECRET=$JwtSecret"
& $NssmExe set $ServiceName Start SERVICE_AUTO_START
& $NssmExe set $ServiceName AppStdout "$BackendDir\logs\service.out.log"
& $NssmExe set $ServiceName AppStderr "$BackendDir\logs\service.err.log"
& $NssmExe set $ServiceName AppRotateFiles 1
& $NssmExe set $ServiceName AppRotateBytes 10485760

# --- 5) 启动并检查 ---
& $NssmExe start $ServiceName
Start-Sleep -Seconds 3
& $NssmExe status $ServiceName

Write-Host "`nBackend service '$ServiceName' installed and started." -ForegroundColor Green
Write-Host "Logs: $BackendDir\logs\service.*.log"
Write-Host "Health check:"
try {
  $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:3000/api/v1/auth/login' -ContentType 'application/json' -Body '{}'
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "  backend responded with HTTP $code (service is up)"
}
Write-Host "`nManage: nssm restart|stop|status $ServiceName" -ForegroundColor Yellow
