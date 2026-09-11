$ErrorActionPreference = 'Continue'
$f = 'C:\tcmp\app\frontend\src\views\Rounds\Execute.vue'
if (Test-Path $f) {
  $info = Get-Item $f
  Write-Output ('SIZE=' + $info.Length)
  Write-Output ('MTIME=' + $info.LastWriteTime.ToString('s'))
  # 精确匹配我们本次改动的字符串
  if (Select-String -Path $f -Pattern 'onNodeExpand' -SimpleMatch -Quiet) {
    Write-Output 'PATCH_PRESENT_OK'
  } else {
    Write-Output 'PATCH_MISSING'
  }
} else {
  Write-Output 'FILE_MISSING'
}
