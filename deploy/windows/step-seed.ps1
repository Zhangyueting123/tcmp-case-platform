$ErrorActionPreference = 'Stop'
$root = 'C:\tcmp\app'
$node = 'C:\Program Files\nodejs\node.exe'
$secretFile = 'C:\tcmp\jwt_secret.txt'

# 1) 生成并持久化强随机 JWT_SECRET（hex，无特殊字符）
if (-not (Test-Path $secretFile)) {
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  Set-Content -Path $secretFile -Value $secret -NoNewline -Encoding ASCII
  Write-Output "generated new JWT secret -> $secretFile"
} else {
  Write-Output "reuse existing JWT secret -> $secretFile"
}
$secret = (Get-Content -Path $secretFile -Raw).Trim()

# 2) 确保数据目录存在（打包时已排除 data，sqljs 不会自动创建父目录）
New-Item -ItemType Directory -Force "$root\backend\data" | Out-Null
New-Item -ItemType Directory -Force "$root\backend\data\backups" | Out-Null

# 3) 运行 seed（在 backend 目录，保证 data\tcmp.db 路径正确）
$env:NODE_ENV = 'production'
$env:JWT_SECRET = $secret
Push-Location "$root\backend"
Write-Output "=== running seed ==="
& $node 'dist\seed.js'
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { throw "seed failed ($code)" }

# 4) 校验数据库已生成
if (-not (Test-Path "$root\backend\data\tcmp.db")) { throw "data\tcmp.db not created" }
$len = (Get-Item "$root\backend\data\tcmp.db").Length
Write-Output ("SEED_OK  db size=" + $len + " bytes")
