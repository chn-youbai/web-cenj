# Vercel 一键部署脚本
param (
    [switch]$Production
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [Antigravity] Deploying to Vercel" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 检查当前登录状态
$whoami = npx --yes vercel whoami 2>$null
if ($LASTEXITCODE -eq 0 -and $whoami -notmatch "Logged out") {
    Write-Host "[OK] 当前已登录 Vercel 账号: $whoami" -ForegroundColor Green
    if ($Production) {
        npx --yes vercel --prod --yes
    } else {
        npx --yes vercel --yes
    }
} else {
    Write-Host "[INFO] 使用免密快速部署模式..." -ForegroundColor Yellow
    npx --yes vercel deploy --temporary --yes
}
