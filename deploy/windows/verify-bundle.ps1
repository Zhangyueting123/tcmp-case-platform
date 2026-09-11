# @author zhangyueting
# @date 2026-06-12
$ErrorActionPreference = 'Continue'
$idx = 'C:\tcmp\app\frontend\dist\index.html'
$raw = Get-Content $idx -Raw
$null = $raw -match '/assets/(index-[A-Za-z0-9_-]+\.js)'
$bundle = 'C:\tcmp\app\frontend\dist\assets\' + $Matches[1]
Write-Output ('BUNDLE=' + $Matches[1])
# 搜字符串字面量（不会被压缩重命名）
foreach ($pat in @('用户手册','在线预览','/docs/')) {
  if (Select-String -Path $bundle -Pattern ([regex]::Escape($pat)) -Quiet) {
    Write-Output ("HAS [$pat]: YES")
  } else {
    Write-Output ("HAS [$pat]: NO")
  }
}
Write-Output 'DONE'
