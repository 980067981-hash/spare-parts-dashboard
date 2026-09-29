# 备件耗材看板

线上看板 + 云端后端服务

## 项目结构

```
备件耗材看板/
├── spare-parts-dashboard/    # 前端看板（静态网页）
│   ├── index.html
│   ├── app.js
│   ├── seed.js              # 库存数据源
│   └── usage_seed.js        # 履历数据源
├── server/                   # 后端服务
│   ├── index.js             # Express + better-sqlite3
│   ├── init-data.json       # 初始化数据
│   └── package.json
├── deploy.ps1               # 一键部署脚本
└── deploy-to-railway.md     # 手动部署指南
```

## 快速开始

### 本地运行

```powershell
cd server
npm install
npm start
# 访问 http://localhost:3000
```

### 部署到 Railway

1. 双击运行 `deploy.ps1`
2. 按提示输入 GitHub 仓库地址
3. Railway 自动部署

## API 端点

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/usage | 获取履历列表 |
| POST | /api/usage | 新增履历 |
| DELETE | /api/usage/:id | 删除履历 |
| GET | /api/inventory | 获取库存列表 |
| PUT | /api/inventory/:id | 更新库存 |
| POST | /api/recognize-result | AI 写入识别结果 |
| GET | /api/health | 健康检查 |

## 数据库

- SQLite 数据库，文件在 `server/data/data.db`
- Railway 提供持久化存储
