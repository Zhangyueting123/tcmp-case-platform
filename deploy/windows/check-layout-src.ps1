# @author zhangyueting
# @date 2026-06-12
$ErrorActionPreference = 'Continue'
$f = 'C:\tcmp\app\frontend\src\views\Layout.vue'
Write-Output ('SIZE=' + (Get-Item $f).Length + ' MTIME=' + (Get-Item $f).LastWriteTime)
Write-Output '=== lines with 用户手册 / onManual / docs ==='
Select-String -Path $f -Pattern '用户手册','onManual','docs','el-dropdown' | ForEach-Object { Write-Output ($_.LineNumber.ToString() + ': ' + $_.Line.Trim()) }
Write-Output '=== vite cache dir ==='
$vc = 'C:\tcmp\app\frontend\node_modules\.vite'
if (Test-Path $vc) { Write-Output ('VITE_CACHE_EXISTS mtime=' + (Get-Item $vc).LastWriteTime) } else { Write-Output 'NO_VITE_CACHE' }
Write-Output 'DONE'
