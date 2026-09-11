$ErrorActionPreference = 'SilentlyContinue'
Write-Output '=== task action (working dir) ==='
$act = (Get-ScheduledTask -TaskName 'TCMP-Backend').Actions
foreach ($a in $act) { Write-Output ("EXECUTE=" + $a.Execute + " ARGS=" + $a.Arguments + " WORKDIR=" + $a.WorkingDirectory) }

Write-Output '=== stopping task ==='
Stop-ScheduledTask -TaskName 'TCMP-Backend'
Start-Sleep -Seconds 2

Write-Output '=== killing lingering node on port 3000 ==='
$conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
  Write-Output ("killing PID " + $c.OwningProcess)
  Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 1

Write-Output '=== starting task ==='
Start-ScheduledTask -TaskName 'TCMP-Backend'
Start-Sleep -Seconds 6

Write-Output '=== verify port 3000 ==='
$c2 = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($c2) {
  $proc = Get-Process -Id $c2[0].OwningProcess
  Write-Output ("LISTENING PID=" + $c2[0].OwningProcess + " NAME=" + $proc.ProcessName)
} else {
  Write-Output 'NOT_LISTENING_YET'
}
Write-Output 'DONE_RESTART'
