# ============================================================
# TCMP Windows 部署 - 步骤1：构建前后端
# 用法：右键“使用 PowerShell 运行”，或在 PowerShell 中执行 .\1-build.ps1
# 前置：已安装 Node.js 20 LTS（node -v 能输出版本）
# ============================================================
$ErrorActionPreference = 'Stop'

# 自动定位仓库根目录（本脚本位于 deploy/windows/ 下，向上两级即仓库根）
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Write-Host "RepoRoot = $RepoRoot"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js not found. Please install Node.js 20 LTS first.' }
Write-Host ("Node " + (node -v))

Write-Host "`n=== Build backend ===" -ForegroundColor Cyan
Push-Location "$RepoRoot\backend"
npm ci
npm run build
Pop-Location

Write-Host "`n=== Build frontend ===" -ForegroundColor Cyan
Push-Location "$RepoRoot\frontend"
npm ci
npm run build
Pop-Location

Write-Host "`nBuild done." -ForegroundColor Green
Write-Host "  backend: $RepoRoot\backend\dist\main.js"
Write-Host "  frontend: $RepoRoot\frontend\dist\index.html"
