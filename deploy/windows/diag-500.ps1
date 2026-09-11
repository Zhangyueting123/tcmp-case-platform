# @author zhangyueting
# @date 2026-06-12
$ErrorActionPreference = 'Continue'
Write-Output '=== services ==='
Get-Service TCMP-Nginx, TCMP-Backend | ForEach-Object { Write-Output ("{0} = {1}" -f $_.Name, $_.Status) }
Write-Output '=== nginx processes ==='
Get-Process nginx -ErrorAction SilentlyContinue | ForEach-Object { Write-Output ("nginx pid " + $_.Id) }
Write-Output '=== dist index ==='
$idx = 'C:\tcmp\app\frontend\dist\index.html'
if (Test-Path $idx) { Write-Output ('INDEX_OK size=' + (Get-Item $idx).Length) } else { Write-Output 'INDEX_MISSING' }
Write-Output '=== dist assets count ==='
$as = 'C:\tcmp\app\frontend\dist\assets'
if (Test-Path $as) { Write-Output ('ASSETS=' + (Get-ChildItem $as -File).Count) } else { Write-Output 'ASSETS_MISSING' }
Write-Output '=== nginx error.log tail ==='
$errlog = 'C:\nginx\logs\error.log'
if (Test-Path $errlog) { Get-Content $errlog -Tail 15 } else { Write-Output 'NO_ERRLOG' }
Write-Output 'DONE_DIAG'
