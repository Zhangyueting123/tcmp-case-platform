$ErrorActionPreference = 'Stop'
$webroot = 'C:/tcmp/app/frontend/dist'
$nginxDir = 'C:\nginx'

# 1) 下载并解压 nginx（若尚未安装）
if (-not (Test-Path "$nginxDir\nginx.exe")) {
  $candidates = @(
    'http://nginx.org/download/nginx-1.26.2.zip',
    'http://nginx.org/download/nginx-1.27.4.zip',
    'http://nginx.org/download/nginx-1.26.3.zip'
  )
  $zip = "$env:TEMP\nginx.zip"
  $ok = $false
  foreach ($u in $candidates) {
    try {
      Write-Output "downloading $u"
      Invoke-WebRequest -Uri $u -OutFile $zip -UseBasicParsing -TimeoutSec 120
      $ok = $true; break
    } catch { Write-Output ("  failed: " + $_.Exception.Message) }
  }
  if (-not $ok) { throw 'nginx download failed from all candidates' }

  $ex = "$env:TEMP\nginx_ex"
  if (Test-Path $ex) { Remove-Item $ex -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $ex -Force
  $inner = Get-ChildItem $ex -Directory | Select-Object -First 1
  New-Item -ItemType Directory -Force $nginxDir | Out-Null
  Copy-Item "$($inner.FullName)\*" $nginxDir -Recurse -Force
  Write-Output "nginx extracted to $nginxDir"
} else {
  Write-Output "nginx already present at $nginxDir"
}

# 2) 生成完整 nginx.conf
$conf = @"
worker_processes  1;
events { worker_connections 1024; }
http {
  include       mime.types;
  default_type  application/octet-stream;
  sendfile        on;
  keepalive_timeout  65;
  client_max_body_size 50m;

  server {
    listen 80;
    server_name _;
    root $webroot;
    index index.html;

    location /api/ {
      proxy_pass http://127.0.0.1:3000/api/;
      proxy_set_header Host `$host;
      proxy_set_header X-Real-IP `$remote_addr;
      proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
    }
    location /uploads/ {
      proxy_pass http://127.0.0.1:3000/uploads/;
    }
    location /socket.io/ {
      proxy_pass http://127.0.0.1:3000/socket.io/;
      proxy_http_version 1.1;
      proxy_set_header Upgrade `$http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host `$host;
      proxy_set_header X-Real-IP `$remote_addr;
      proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
      proxy_read_timeout 3600s;
      proxy_send_timeout 3600s;
    }
    location / {
      try_files `$uri `$uri/ /index.html;
    }
  }
}
"@
Set-Content -Path "$nginxDir\conf\nginx.conf" -Value $conf -Encoding ASCII
Write-Output "nginx.conf written (root=$webroot)"

# 3) 校验配置
$ErrorActionPreference = 'Continue'
Push-Location $nginxDir
$test = & "$nginxDir\nginx.exe" -t 2>&1
Pop-Location
Write-Output ("nginx -t: " + ($test -join ' '))

# 4) 放行防火墙 80
if (-not (Get-NetFirewallRule -DisplayName 'TCMP HTTP 80' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName 'TCMP HTTP 80' -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow | Out-Null
  Write-Output "firewall: allowed inbound TCP 80"
} else {
  Write-Output "firewall rule already exists"
}

# 5) (重)启动 nginx
Push-Location $nginxDir
$running = Get-Process nginx -ErrorAction SilentlyContinue
if ($running) {
  & "$nginxDir\nginx.exe" -s reload 2>&1 | Out-Null
  Write-Output "nginx reloaded"
} else {
  Start-Process -FilePath "$nginxDir\nginx.exe" -WorkingDirectory $nginxDir
  Start-Sleep -Seconds 2
  Write-Output "nginx started"
}
Pop-Location

Start-Sleep -Seconds 1
$proc = Get-Process nginx -ErrorAction SilentlyContinue
Write-Output ("nginx processes: " + (@($proc).Count))
Write-Output "NGINX_DONE"
