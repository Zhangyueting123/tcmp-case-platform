$ErrorActionPreference = 'Continue'
Remove-Item 'C:\Users\mech-mind\tcmp-deploy.zip' -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Users\mech-mind\_tcmp_step.ps1' -Force -ErrorAction SilentlyContinue
# 移除误打包进来的本地虚拟环境
Remove-Item 'C:\tcmp\app\.venv' -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "cleanup done"
Get-ChildItem 'C:\tcmp\app' | Select-Object -ExpandProperty Name
