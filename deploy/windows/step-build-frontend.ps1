$ErrorActionPreference = 'Stop'
$root = 'C:\tcmp\app'
$npm = 'C:\Program Files\nodejs\npm.cmd'

function RunNpm($wd, [string[]]$npmArgs, [int]$retries = 2) {
  for ($i = 0; $i -le $retries; $i++) {
    Write-Output (">> [try $i] [$wd] npm " + ($npmArgs -join ' '))
    Push-Location $wd
    & $npm @npmArgs
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -eq 0) { return }
    Write-Output ("  npm exit " + $code + ", retrying...")
    Start-Sleep -Seconds 3
  }
  throw ("npm failed after retries: " + ($npmArgs -join ' '))
}

Write-Output "=== frontend: npm install ==="
# 用 install 替代 ci，对偶发的 npm 退出处理崩溃更稳健
RunNpm "$root\frontend" @('install', '--no-audit', '--no-fund')
Write-Output "`n=== frontend: build ==="
RunNpm "$root\frontend" @('run', 'build')

if (-not (Test-Path "$root\frontend\dist\index.html")) { throw "frontend build missing dist\index.html" }
Write-Output "`nFRONTEND_OK"
