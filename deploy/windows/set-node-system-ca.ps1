$ErrorActionPreference = 'Stop'
$nssm = 'C:\tcmp\nssm.exe'
$svc  = 'TCMP-Backend'
$jwt  = Get-Content 'C:\tcmp\jwt_secret.txt' -Raw
$jwt  = $jwt.Trim()

$envs = @(
  "NODE_ENV=production",
  "PORT=3000",
  "JWT_SECRET=$jwt",
  "DINGTALK_MODE=WEBHOOK",
  "DINGTALK_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=9cdb01257f30aea321513b8fb403e12ed6bc8fcf07cd63e3fb32af2838aa9550",
  "DINGTALK_SECRET=SECa99cc0c418a185fb9164a15e27e5ee082877402cd61d5ccbde7b0d620652ea51",
  "DINGTALK_PUBLIC_BASE_URL=http://192.168.18.151",
  "NODE_OPTIONS=--use-system-ca"
)

& $nssm set $svc AppEnvironmentExtra $envs
Write-Output '--- After set ---'
& $nssm get $svc AppEnvironmentExtra

Write-Output '--- Restarting service ---'
& $nssm restart $svc
Start-Sleep -Seconds 3
& $nssm status $svc
