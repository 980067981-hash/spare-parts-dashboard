# 备件耗材看板 - Railway 部署脚本
# 使用方法：在 PowerShell 中执行此脚本
# 需要先安装 Git: https://git-scm.com/download/win

$projectRoot = "C:\Users\OP\WorkBuddy\2026-09-24-17-11-48\备件耗材看板"
Set-Location $projectRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  备件耗材看板 - Railway 部署脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Git
$gitVersion = git --version 2>$null
if (-not $gitVersion) {
    Write-Host "❌ 错误: Git 未安装或未在 PATH 中" -ForegroundColor Red
    Write-Host ""
    Write-Host "请先安装 Git:" -ForegroundColor Yellow
    Write-Host "https://git-scm.com/download/win" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "安装后重新运行此脚本" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ Git 版本: $gitVersion" -ForegroundColor Green

# 检查 GitHub 是否已登录
Write-Host ""
Write-Host "请确认以下信息:" -ForegroundColor Cyan
Write-Host "  1. GitHub 账号已登录 (github.com)"
Write-Host "  2. 已创建新仓库 spare-parts-dashboard"
Write-Host ""

$githubRepo = Read-Host "请输入 GitHub 仓库地址 (如: https://github.com/用户名/spare-parts-dashboard.git)"
if (-not $githubRepo) {
    Write-Host "❌ 仓库地址不能为空" -ForegroundColor Red
    exit 1
}

# 初始化 Git 仓库
Write-Host ""
Write-Host "正在初始化 Git 仓库..." -ForegroundColor Yellow
git init
git add .
git commit -m "feat: 备件耗材看板 + 云端后端服务"

# 添加远程仓库
Write-Host "正在添加远程仓库..." -ForegroundColor Yellow
git remote add origin $githubRepo
git branch -M main
git push -u origin main

Write-Host ""
Write-Host "✅ 代码已推送到 GitHub!" -ForegroundColor Green
Write-Host ""
Write-Host "接下来请在 Railway 上部署:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. 打开 https://railway.app" -ForegroundColor White
Write-Host "  2. 点击 New Project → Deploy from GitHub repo" -ForegroundColor White
Write-Host "  3. 选择 spare-parts-dashboard 仓库" -ForegroundColor White
Write-Host "  4. 等待构建完成（约 2 分钟）" -ForegroundColor White
Write-Host ""
Write-Host "部署成功后，Railway 会给你一个链接:" -ForegroundColor White
Write-Host "  https://spare-parts-server-xxxx.up.railway.app" -ForegroundColor Cyan
Write-Host ""
Write-Host "看板访问地址:" -ForegroundColor White
Write-Host "  https://spare-parts-server-xxxx.up.railway.app/index.html" -ForegroundColor Cyan
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  部署完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
