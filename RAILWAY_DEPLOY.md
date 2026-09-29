# 备件耗材看板 - Railway 部署指南

## 快速部署（跟着做就行）

### 第一步：初始化 Git 仓库

打开 **PowerShell**，执行：

```powershell
cd "C:\Users\OP\WorkBuddy\2026-09-24-17-11-48\备件耗材看板"
git init
git add .
git commit -m "feat: 备件耗材看板 + 云端后端"
```

### 第二步：推送 GitHub

1. 去 https://github.com/new 创建新仓库（不用勾 README）
2. 复制仓库地址（如 `https://github.com/你的用户名/spare-parts-dashboard.git`）
3. 执行：

```powershell
git remote add origin <仓库地址>
git branch -M main
git push -u origin main
```

### 第三步：部署到 Railway

1. 打开 https://railway.app → 登录
2. **New Project** → **Deploy from GitHub repo**
3. 选择刚才推送的仓库
4. 等约 2 分钟构建完成

### 第四步：获取上线链接

部署成功后，Railway 会显示：

```
🌐 https://spare-parts-server-xxxx.up.railway.app
```

**看板访问地址：**
```
https://spare-parts-server-xxxx.up.railway.app/index.html
```

### 第五步：初始化数据（必做）

首次部署后需要导入现有数据，调用一次 `/api/init`：

**方法 A — 本地运行后初始化（推荐测试用）：**
```powershell
cd server
npm install
node index.js
# 另一个终端：
curl -X POST http://localhost:3000/api/init ^
  -H "Content-Type: application/json" ^
  -d @server/init-data.json
```

**方法 B — 直接推送到 Railway 后手动初始化：**
```bash
curl -X POST https://你的域名/api/init \
  -H "Content-Type: application/json" \
  -d @server/init-data.json
```

---

## 验证部署成功

访问健康检查接口：
```
https://你的域名/api/health
```

返回：
```json
{"status":"ok","database":"connected","records":16}
```

---

## 数据库说明

- SQLite 文件存储在 `server/data/data.db`
- Railway 提供持久化存储，重启后数据不丢
- 首次启动自动建表（usage_records、inventory_items）
- 数据库初始化脚本：`server/init-data.js`，生成 `server/init-data.json`

---

## AI 手写体识别对接

**当前方式（推荐）：**
1. 你在网页上传图片 → 后端保存
2. 把图片发给我识别
3. 我调用 `/api/recognize-result` 把识别结果写入数据库

后续可以继续自动化：配置 AI API 后，上传图片自动触发识别流程。

---

## 本地测试

```powershell
cd C:\Users\OP\WorkBuddy\2026-09-24-17-11-48\备件耗材看板\server
npm install
node index.js
# 访问 http://localhost:3000
```
