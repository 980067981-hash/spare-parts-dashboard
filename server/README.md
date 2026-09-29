# 备件耗材看板后端

Express + better-sqlite3 后端服务，支持履历管理和库存管理。

## 快速开始

```bash
cd server
npm install
npm start
```

访问 http://localhost:3000

## API 端点

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/usage | 获取所有履历记录 |
| GET | /api/usage/:id | 获取单条履历 |
| POST | /api/usage | 新增履历 |
| DELETE | /api/usage/:id | 删除履历 |
| GET | /api/inventory | 获取库存列表 |
| PUT | /api/inventory/:id | 更新库存 |
| POST | /api/upload | 上传图片 |
| POST | /api/recognize-result | AI 写入识别结果 |
| POST | /api/init | 初始化数据 |
| GET | /api/health | 健康检查 |

## 部署

见 `RAILWAY_DEPLOY.md` 或 `deploy-to-railway.md`
