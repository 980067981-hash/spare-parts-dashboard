# 备件耗材看板 - 云端部署计划

## 已完成

### 1. 后端服务代码（server/）
- **server/index.js** — Express + SQLite 全功能后端
- **server/package.json** — 依赖配置
- **server/vercel.json** — Vercel 部署配置

### 2. API 端点
| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/usage` | GET | 获取所有履历记录 |
| `/api/usage` | POST | 新增履历记录 |
| `/api/usage/:id` | DELETE | 删除履历记录 |
| `/api/inventory` | GET | 获取库存列表 |
| `/api/inventory/:id` | PUT | 更新库存 |
| `/api/upload` | POST | 上传图片（待对接识别） |
| `/api/health` | GET | 健康检查 |

### 3. 数据库
- SQLite 数据库：`server/data.db`
- 表：`usage_records`（履历）、`inventory_items`（库存）
- 自动迁移，无需手动建表

---

## 下一步：需要你的选择

### 选项 A：本地运行（最快验证）
```bash
cd server
npm install
node index.js
```
访问：http://localhost:3000

### 选项 B：Vercel 部署（免费，推荐）
1. 代码推送到 GitHub
2. 在 Vercel 导入项目
3. 部署后获得 HTTPS 链接

**问题：SQLite 在 Vercel 上是只读的，需要换成云数据库**

### 选项 C：腾讯云函数（稳定生产）
1. 创建 Serverless 项目
2. 配置云数据库（CosDB for MongoDB 或 CDB）
3. 部署到腾讯云服务

---

## AI 识别对接方案

### 方案 1：WorkBuddy AI（推荐）
- 直接调用我的 AI 能力
- 需要配置 WorkBuddy connector 权限
- 手写体识别准确率高

### 方案 2：第三方 OCR API
- 腾讯云 OCR（手写体支持好）
- 百度 AI OCR
- 需要 API Key

---

## 请确认

1. **部署平台选择**：Vercel / 腾讯云 / 其他？
2. **AI 识别方式**：WorkBuddy AI / 第三方 OCR / 都不需要，先手动录入？
3. **数据库需求**：需要持久化到云端 / 还是本地 SQLite 就够了？

确认后我会提供具体的部署命令和配置步骤。
