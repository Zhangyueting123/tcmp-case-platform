$ErrorActionPreference = 'Stop'
$dist = 'C:\tcmp\app\frontend\dist'
$idx = Join-Path $dist 'index.html'
$raw = Get-Content $idx -Raw
if ($raw -match '/assets/(index-[A-Za-z0-9_-]+\.js)') {
  $bundle = Join-Path $dist ('assets\' + $Matches[1])
  Write-Output ('BUNDLE=' + $Matches[1])
  # 关键字面量：中文 UI 文本 & 新接口路径
  $tests = @('个人设置', '当前密码', '/auth/me', '钉钉群内')
  foreach ($t in $tests) {
    if (Select-String -Path $bundle -SimpleMatch -Pattern $t -Quiet) {
      Write-Output ('HIT: ' + $t)
    } else {
      Write-Output ('MISS: ' + $t)
    }
  }
}
Write-Output '---backend dist check---'
$svc = 'C:\tcmp\app\backend\dist\modules\auth\auth.service.js'
$ctl = 'C:\tcmp\app\backend\dist\modules\auth\auth.controller.js'
if (Select-String -Path $svc -SimpleMatch -Pattern 'updateProfile' -Quiet) { Write-Output 'SVC_updateProfile: YES' } else { Write-Output 'SVC_updateProfile: NO' }
if (Select-String -Path $ctl -SimpleMatch -Pattern 'updateProfile' -Quiet) { Write-Output 'CTL_updateProfile: YES' } else { Write-Output 'CTL_updateProfile: NO' }
if (Select-String -Path $ctl -SimpleMatch -Pattern 'Patch' -Quiet) { Write-Output 'CTL_Patch: YES' } else { Write-Output 'CTL_Patch: NO' }
