# @author zhangyueting
# @date 2026-06-12
$ErrorActionPreference = 'Continue'
$front = 'C:\tcmp\app\frontend'
Write-Output '=== all Layout.vue under frontend\src ==='
Get-ChildItem -Path "$front\src" -Recurse -Filter 'Layout.vue' | ForEach-Object {
  $has = (Select-String -Path $_.FullName -Pattern 'onManual' -Quiet)
  Write-Output ("{0}  | onManual={1} | {2} bytes | {3}" -f $_.FullName, $has, $_.Length, $_.LastWriteTime)
}
Write-Output '=== grep onManual everywhere in src ==='
Get-ChildItem -Path "$front\src" -Recurse -Include *.vue,*.ts | Select-String -Pattern 'onManual' | ForEach-Object { Write-Output ("HIT: " + $_.Path + ":" + $_.LineNumber) }
Write-Output '=== router import of Layout ==='
Get-ChildItem -Path "$front\src" -Recurse -Include *.ts | Select-String -Pattern 'Layout' | ForEach-Object { Write-Output ("ROUTE: " + $_.Path + " => " + $_.Line.Trim()) }
Write-Output 'DONE_ENUM'
