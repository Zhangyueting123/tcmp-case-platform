# @author zhangyueting
# @date 2026-06-12
# 停 nginx 释放 dist 占用 -> 干净重建前端 -> 校验 index.html -> 重启 nginx
$ErrorActionPreference = 'Continue'
$front = 'C:\tcmp\app\frontend'
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source; if (-not $npm) { $npm = 'C:\Program Files\nodejs\npm.cmd' }
$nssm = 'C:\tcmp\nssm.exe'

# 走 Windows 证书库，绕过公司出口 sangfor HTTPS 中间人
$env:NODE_OPTIONS = '--use-system-ca'

Write-Output 'STOP_NGINX'
& $nssm stop TCMP-Nginx | Out-Null
Start-Sleep -Seconds 2

Set-Location $front
Write-Output 'CLEAN_DIST'
Remove-Item "$front\dist" -Recurse -Force -ErrorAction SilentlyContinue

Write-Output 'BUILD_START'
$env:npm_config_registry = 'https://registry.npmmirror.com'
& $npm run build 2>&1 | ForEach-Object { Write-Output $_ }
Write-Output ('BUILD_EXIT=' + $LASTEXITCODE)

Write-Output 'VERIFY'
$idx = Join-Path $front 'dist\index.html'
if (Test-Path $idx) {
  Write-Output ('INDEX_OK size=' + (Get-Item $idx).Length)
  $raw = Get-Content $idx -Raw
  if ($raw -match '/assets/(index-[A-Za-z0-9_-]+\.js)') {
    $bundle = Join-Path $front ('dist\assets\' + $Matches[1])
    Write-Output ('BUNDLE=' + $Matches[1])
    if (Select-String -Path $bundle -Pattern 'onManual' -Quiet) { Write-Output 'DIST_HAS_onManual: YES' } else { Write-Output 'DIST_HAS_onManual: NO' }
  }
} else {
  Write-Output 'INDEX_MISSING_AFTER_BUILD'
}

Write-Output 'START_NGINX'
& $nssm start TCMP-Nginx | Out-Null
Start-Sleep -Seconds 3
Write-Output 'DONE_REBUILD'
