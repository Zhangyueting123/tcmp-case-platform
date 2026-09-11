$ErrorActionPreference = 'Continue'
$front = 'C:\tcmp\app\frontend'
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source; if (-not $npm) { $npm = 'C:\Program Files\nodejs\npm.cmd' }
Write-Output ('using npm: ' + $npm)
$env:NODE_OPTIONS = '--use-system-ca'
$env:npm_config_registry = 'https://registry.npmmirror.com'
Set-Location $front

Write-Output '=== npm ci ==='
& $npm ci 2>&1 | ForEach-Object { Write-Output $_ }
if ($LASTEXITCODE -ne 0) {
  Write-Output 'npm ci failed, retry with npm install'
  & $npm install 2>&1 | ForEach-Object { Write-Output $_ }
}
Write-Output ('INSTALL_EXIT=' + $LASTEXITCODE)

Write-Output '=== build ==='
& $npm run build 2>&1 | ForEach-Object { Write-Output $_ }
Write-Output ('BUILD_EXIT=' + $LASTEXITCODE)

Write-Output '=== verify ==='
$idx = Join-Path $front 'dist\index.html'
if (Test-Path $idx) {
  $raw = Get-Content $idx -Raw
  if ($raw -match '/assets/(index-[A-Za-z0-9_-]+\.js)') { Write-Output ('BUNDLE=' + $Matches[1]) }
  Write-Output ('INDEX_OK size=' + (Get-Item $idx).Length)
} else {
  Write-Output 'INDEX_MISSING_AFTER_BUILD'
}
Write-Output 'DONE_INSTALL_BUILD'
