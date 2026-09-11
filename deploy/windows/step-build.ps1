$ErrorActionPreference = 'Stop'
$root = 'C:\tcmp\app'
$npm = 'C:\Program Files\nodejs\npm.cmd'
$node = 'C:\Program Files\nodejs\node.exe'

# 走 Windows 证书库，绕过公司出口 sangfor HTTPS 中间人（否则 npm ci 走 https 会失败）
$env:NODE_OPTIONS = '--use-system-ca'

function RunNpm($wd, [string[]]$npmArgs) {
  Write-Output (">> [$wd] npm " + ($npmArgs -join ' '))
  Push-Location $wd
  & $npm @npmArgs
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { throw ("npm failed (" + $code + "): " + ($npmArgs -join ' ')) }
}

# 使用淘宝镜像，规避公司网络对 npm 默认源的拦截
& $npm config set registry https://registry.npmmirror.com | Out-Null
Write-Output ("node " + (& $node -v))
Write-Output ("npm  " + (& $npm -v))

Write-Output "`n=== backend: npm ci ==="
RunNpm "$root\backend" @('ci', '--no-audit', '--no-fund')
Write-Output "`n=== backend: build ==="
RunNpm "$root\backend" @('run', 'build')

Write-Output "`n=== frontend: npm ci ==="
RunNpm "$root\frontend" @('ci', '--no-audit', '--no-fund')
Write-Output "`n=== frontend: build ==="
RunNpm "$root\frontend" @('run', 'build')

if (-not (Test-Path "$root\backend\dist\main.js")) { throw "backend build missing dist\main.js" }
if (-not (Test-Path "$root\frontend\dist\index.html")) { throw "frontend build missing dist\index.html" }
Write-Output "`nBUILD_OK"
