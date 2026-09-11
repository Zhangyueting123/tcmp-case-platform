$ErrorActionPreference = 'Continue'

Write-Output "=== 1) GET http://localhost/ (前端首页) ==="
try {
  $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost/' -TimeoutSec 10
  $hasRoot = $r.Content -match 'id="app"|<div id=app|TCMP|<!doctype html'
  Write-Output ("  HTTP " + $r.StatusCode + "  len=" + $r.Content.Length + "  looksLikeSPA=" + [bool]$hasRoot)
} catch { Write-Output ("  ERR " + $_.Exception.Message) }

Write-Output "=== 2) POST /api/v1/auth/login (经 nginx 反代) ==="
try {
  $body = '{"email":"admin@mech-mind.net","password":"Admin@123"}'
  $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost/api/v1/auth/login' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 15
  $j = $r.Content | ConvertFrom-Json
  $tok = $j.data.accessToken
  Write-Output ("  HTTP " + $r.StatusCode + "  code=" + $j.code + "  tokenLen=" + ($tok.Length))
} catch { Write-Output ("  ERR " + $_.Exception.Message) }

Write-Output "=== 3) 服务自启状态 ==="
foreach ($s in 'TCMP-Backend','TCMP-Nginx') {
  $svc = Get-Service $s -ErrorAction SilentlyContinue
  if ($svc) {
    $startType = (Get-CimInstance Win32_Service -Filter "Name='$s'").StartMode
    Write-Output ("  " + $s + ": " + $svc.Status + " / StartMode=" + $startType)
  } else { Write-Output ("  " + $s + ": NOT FOUND") }
}

Write-Output "=== 4) 监听端口 ==="
$p80 = (Get-NetTCPConnection -LocalPort 80 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count
$p3000 = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Output ("  listen80=" + $p80 + "  listen3000=" + $p3000)

Write-Output "VERIFY_DONE"
