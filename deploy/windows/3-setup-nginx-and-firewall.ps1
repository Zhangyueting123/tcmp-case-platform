# ============================================================
# TCMP Windows 部署 - 步骤3：生成 nginx 配置 + 放行防火墙 80 端口
# 必须以【管理员】身份运行。
# 本脚本会基于本机实际路径生成 nginx-tcmp.generated.conf（已填好 root）。
# ============================================================
#requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$webRoot  = ("$RepoRoot\frontend\dist") -replace '\\','/'

if (-not (Test-Path "$RepoRoot\frontend\dist\index.html")) {
  throw "Frontend not built. Run 1-build.ps1 first."
}

# 1) 生成填好 root 的 nginx 配置
$tpl  = Get-Content (Join-Path $PSScriptRoot 'nginx-tcmp.conf') -Raw
$conf = $tpl -replace 'C:/path/to/.+?/frontend/dist', $webRoot
$out  = Join-Path $PSScriptRoot 'nginx-tcmp.generated.conf'
Set-Content -Path $out -Value $conf -Encoding UTF8
Write-Host "Generated nginx config: $out" -ForegroundColor Green
Write-Host "  root -> $webRoot"

# 2) 放行入站 80 端口
$ruleName = 'TCMP HTTP 80'
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow | Out-Null
  Write-Host "Firewall: inbound TCP 80 allowed." -ForegroundColor Green
} else {
  Write-Host "Firewall rule already exists: $ruleName"
}

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1) Install nginx for Windows (http://nginx.org/en/download.html)"
Write-Host "  2) Copy '$out' into nginx\conf\ , and include it from nginx.conf,"
Write-Host "     or replace nginx\conf\nginx.conf's server{} block with it."
Write-Host "  3) Start nginx:  cd C:\nginx ; .\nginx.exe   (reload: .\nginx.exe -s reload)"
Write-Host "  4) Browse from another PC:  http://<this-server-LAN-IP>/"
Write-Host "`nFind this server IP with:  ipconfig  (look at IPv4 Address)"
