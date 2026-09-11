# @author zhangyueting
# @date 2026-06-12
$ErrorActionPreference = 'Continue'
$conf = 'C:\nginx\conf\nginx.conf'
Get-Content $conf | Where-Object { $_ -match 'root|location|listen|server_name' } | ForEach-Object { Write-Output $_.Trim() }
Write-Output '=== DIST DIR ==='
if (Test-Path 'C:\tcmp\app\frontend\dist') { Write-Output 'dist exists: C:\tcmp\app\frontend\dist' }
