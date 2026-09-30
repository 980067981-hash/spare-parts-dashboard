# Railway 修复部署脚本
# 执行以下命令完成部署

Set-Location "C:\Users\OP\WorkBuddy\2026-09-24-17-11-48\备件耗材看板"

# 1. 添加修改
git add .

# 2. 提交
git commit -m "fix: 移除未使用的 sqlite3 依赖，修复 Railway 构建失败"

# 3. 推送
git push origin main

Write-Host "推送完成！请回到 Railway 重新部署。"
Write-Host "在 Railway 项目中点击 'Deploy' -> 'Redeploy' 触发新的构建。"
