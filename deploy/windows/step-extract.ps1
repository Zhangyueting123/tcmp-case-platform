$ErrorActionPreference = 'Stop'
$dst = 'C:\tcmp\app'
$zip = 'C:\Users\mech-mind\tcmp-deploy.zip'

if (-not (Test-Path $zip)) { throw "zip not found: $zip" }

# 保留已存在的数据目录（升级场景），仅清理代码
if (Test-Path $dst) {
  if (Test-Path "$dst\backend\data") {
    New-Item -ItemType Directory -Force 'C:\tcmp\_data_backup' | Out-Null
    Copy-Item "$dst\backend\data" 'C:\tcmp\_data_backup\data' -Recurse -Force
    Write-Output 'existing data dir backed up to C:\tcmp\_data_backup\data'
  }
}
New-Item -ItemType Directory -Force $dst | Out-Null

Expand-Archive -Path $zip -DestinationPath $dst -Force
Write-Output "extracted to $dst"
Get-ChildItem $dst | Select-Object -ExpandProperty Name
