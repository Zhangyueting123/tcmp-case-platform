# @author zhangyueting
# @date 2026-06-12
$ErrorActionPreference = 'Continue'
$layout = 'C:\tcmp\app\frontend\src\views\Layout.vue'
Write-Output '=== Layout.vue 含 onManual? ==='
if (Select-String -Path $layout -Pattern 'onManual' -Quiet) { Write-Output 'SRC_HAS_onManual: YES' } else { Write-Output 'SRC_HAS_onManual: NO' }
Write-Output '=== dist 引用的 bundle ==='
$idx = 'C:\tcmp\app\frontend\dist\index.html'
(Get-Content $idx -Raw) -match '/assets/index-[A-Za-z0-9_-]+\.js' | Out-Null
Write-Output $Matches[0]
Write-Output '=== dist bundle 含用户手册? ==='
$bundle = 'C:\tcmp\app\frontend\dist' + ($Matches[0] -replace '/', '\')
if (Test-Path $bundle) {
  if (Select-String -Path $bundle -Pattern 'onManual' -Quiet) { Write-Output 'DIST_HAS_onManual: YES' } else { Write-Output 'DIST_HAS_onManual: NO' }
} else { Write-Output "bundle not found: $bundle" }
Write-Output '=== dist 目录时间 ==='
Get-Item $idx | Select-Object -ExpandProperty LastWriteTime
