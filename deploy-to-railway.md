# 部署到 Railway 指南

## 快速部署（5分钟）

### 第一步：推送代码到 GitHub

```powershell
# 在项目根目录执行
cd "C:\Users\OP\WorkBuddy\2026-09-24-17-11-48\备件耗材看板"
git init
git add .
git commit -m "feat: 备件耗材看板 + 云端后端"
git branch -M main

# 创建 GitHub 仓库并推送（需要先登录 GitHub）
git remote add origin https://github.com/你的用户名/spare-parts-dashboard.git
git push -u origin main
```

### 第二步：Railway 部署

1. 打开 https://railway.app
2. 点 **New Project** → **Deploy from GitHub repo**
3. 选择刚才的仓库
4. 等待构建完成（约 2 分钟）

### 第三步：获取上线链接

Railway 会自动分配一个域名：
```
https://spare-parts-server-xxxx.up.railway.app
```

看板访问地址：
```
https://spare-parts-server-xxxx.up.railway.app/index.html
```

---

## 数据库说明

- 使用 SQLite 数据库，文件存储在 `server/data/data.db`
- Railway 提供持久化存储，重启后数据不丢失
- 首次启动会自动从 `init-data.json` 导入现有数据（84条库存 + 16条履历）

---

## API 使用

### AI 写入识别结果

识别完履历表后，调用此接口：

```bash
curl -X POST https://你的域名/api/recognize-result \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      {"id": "U1017", "date": "7.19", "equipment": "DB4#", "model": "DA403D", "part": "NTC/MPD吸嘴", "reason": "磨损", "handler": "高丽"}
    ]
  }'
```

---

## 本地测试

```powershell
cd server
npm install
node index.js
# 访问 http://localhost:3000
```
