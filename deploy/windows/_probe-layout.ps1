$ErrorActionPreference = 'Continue'
Write-Output '--- C:\tcmp ---'
Get-ChildItem 'C:\tcmp' -Force | Select-Object -ExpandProperty Name
Write-Output '--- app? ---'
if (Test-Path 'C:\tcmp\app\frontend\src\views\Rounds\Execute.vue') { Write-Output 'APP_EXECUTE_VUE_OK' } else { Write-Output 'APP_EXECUTE_VUE_MISSING' }
