$ErrorActionPreference = 'Stop'
$root = 'C:\tcmp\app'
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source; if (-not $npm) { $npm = 'C:\Program Files\nodejs\npm.cmd' }
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source; if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
Write-Output ("using npm: " + $npm)

# 走 Windows 证书库，绕过公司出口 sangfor HTTPS 中间人
$env:NODE_OPTIONS = '--use-system-ca'
& $npm config set registry https://registry.npmmirror.com | Out-Null

Push-Location "$root\backend"
Write-Output '=== backend: npm ci ==='
& $npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
  Write-Output '   npm ci failed, retry with npm install'
  & $npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'backend npm install failed' }
}
Write-Output '=== backend: build ==='
& $npm run build
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { throw "backend build failed ($code)" }
if (-not (Test-Path "$root\backend\dist\main.js")) { throw 'backend build missing dist\main.js' }
Write-Output 'BACKEND_BUILD_OK'
