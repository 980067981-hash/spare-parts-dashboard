const express = require('express');
const multer = require('multer');
const Database = require('better-sqlite3');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 数据库初始化（better-sqlite3 同步 API）
const db = new Database(path.join(DATA_DIR, 'data.db'));
db.pragma('journal_mode = WAL'); // 提高并发性能

// 建表
db.exec(`
  CREATE TABLE IF NOT EXISTS usage_records (
    id TEXT PRIMARY KEY,
    date TEXT,
    equipment TEXT,
    model TEXT,
    part TEXT,
    reason TEXT,
    preventive TEXT,
    maint_time TEXT,
    handler TEXT,
    other TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY,
    process TEXT,
    equipment TEXT,
    name TEXT,
    stock INTEGER DEFAULT 0,
    safety INTEGER DEFAULT 0,
    safety_auto BOOLEAN DEFAULT 0,
    status TEXT,
    note TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 配置 multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// ==================== 中间件 ====================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../spare-parts-dashboard')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==================== API 路由 ====================

// 获取所有履历记录
app.get('/api/usage', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM usage_records ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取单条履历
app.get('/api/usage/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM usage_records WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: '记录不存在' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 新增履历
app.post('/api/usage', (req, res) => {
  try {
    const { id, date, equipment, model, part, reason, preventive, maint_time, handler, other, note } = req.body;
    const recordId = id || uuidv4();
    db.prepare(`
      INSERT OR REPLACE INTO usage_records (id, date, equipment, model, part, reason, preventive, maint_time, handler, other, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(recordId, date, equipment, model, part, reason, preventive, maint_time, handler, other, note);
    res.json({ id: recordId, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除履历
app.delete('/api/usage/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM usage_records WHERE id = ?');
    const info = stmt.run(req.params.id);
    res.json({ success: true, changes: info.changes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取库存列表
app.get('/api/inventory', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM inventory_items ORDER BY process, equipment').all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 更新库存
app.put('/api/inventory/:id', (req, res) => {
  try {
    const { stock, safety, safety_auto, status, note } = req.body;
    db.prepare(`
      UPDATE inventory_items
      SET stock = ?, safety = ?, safety_auto = ?, status = ?, note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(stock, safety, safety_auto ? 1 : 0, status, note, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 上传图片
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有上传图片' });
  res.json({
    success: true,
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    message: '图片已上传，请将图片发给我进行识别'
  });
});

// 写入识别结果（供 AI 调用）
app.post('/api/recognize-result', (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'records 必须是数组' });
    }
    let count = 0;
    for (const r of records) {
      db.prepare(`
        INSERT OR REPLACE INTO usage_records (id, date, equipment, model, part, reason, preventive, maint_time, handler, other, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        r.id || uuidv4(), r.date, r.equipment, r.model, r.part, r.reason,
        r.preventive || '', r.maintTime || r.maint_time || '', r.handler, r.other || '', r.note || ''
      );
      count++;
    }
    res.json({ success: true, inserted: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 初始化数据（首次部署或手动重置）
app.post('/api/init', (req, res) => {
  try {
    const { usageRecords, inventoryItems } = req.body;
    if (!usageRecords || !inventoryItems) {
      return res.status(400).json({ error: '需要提供 usageRecords 和 inventoryItems' });
    }
    // 清空并重建
    db.prepare('DELETE FROM usage_records').run();
    db.prepare('DELETE FROM inventory_items').run();
    // 插入履历
    for (const r of usageRecords) {
      db.prepare(`
        INSERT INTO usage_records (id, date, equipment, model, part, reason, preventive, maint_time, handler, other, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(r.id, r.date, r.equipment, r.model, r.part, r.reason, r.preventive, r.maintTime, r.handler, r.other, r.note);
    }
    // 插入库存
    for (const item of inventoryItems) {
      db.prepare(`
        INSERT INTO inventory_items (id, process, equipment, name, stock, safety, safety_auto, status, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(item.id, item.process, item.equipment, item.name, item.stock, item.safety, item.safetyAuto ? 1 : 0, item.status || '', item.note || '');
    }
    res.json({ success: true, usage: usageRecords.length, inventory: inventoryItems.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 启动时自动初始化（如果数据库为空）
app.get('/api/init-on-start', (req, res) => {
  try {
    const initDataPath = path.join(__dirname, 'init-data.json');
    if (!fs.existsSync(initDataPath)) {
      return res.json({ status: 'no-init-data', message: '未找到 init-data.json' });
    }
    const initData = JSON.parse(fs.readFileSync(initDataPath, 'utf-8'));
    const usageCount = db.prepare('SELECT COUNT(*) as cnt FROM usage_records').get();
    if (usageCount.cnt > 0) {
      return res.json({ status: 'already-initialized', records: usageCount.cnt });
    }
    // 插入数据
    for (const r of initData.usageRecords) {
      db.prepare(`
        INSERT INTO usage_records (id, date, equipment, model, part, reason, preventive, maint_time, handler, other, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(r.id, r.date, r.equipment, r.model, r.part, r.reason, r.preventive, r.maintTime, r.handler, r.other, r.note);
    }
    for (const item of initData.inventoryItems) {
      db.prepare(`
        INSERT INTO inventory_items (id, process, equipment, name, stock, safety, safety_auto, status, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(item.id, item.process, item.equipment, item.name, item.stock, item.safety, item.safetyAuto ? 1 : 0, item.status || '', item.note || '');
    }
    console.log('✅ 数据自动初始化完成');
    res.json({ status: 'initialized', usage: initData.usageRecords.length, inventory: initData.inventoryItems.length });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  try {
    const usageCount = db.prepare('SELECT COUNT(*) as cnt FROM usage_records').get();
    const itemCount = db.prepare('SELECT COUNT(*) as cnt FROM inventory_items').get();
    res.json({
      status: 'ok',
      database: 'connected',
      uptime: process.uptime(),
      usageRecords: usageCount.cnt,
      inventoryItems: itemCount.cnt
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`✅ 服务器运行在 http://localhost:${PORT}`);
  console.log(`📊 看板访问: http://localhost:${PORT}/index.html`);
  console.log(`💾 数据库: ${path.join(DATA_DIR, 'data.db')}`);

  // 自动初始化数据
  const initDataPath = path.join(__dirname, 'init-data.json');
  if (fs.existsSync(initDataPath)) {
    try {
      const initData = JSON.parse(fs.readFileSync(initDataPath, 'utf-8'));
      const usageCount = db.prepare('SELECT COUNT(*) as cnt FROM usage_records').get();
      if (usageCount.cnt === 0) {
        for (const r of initData.usageRecords) {
          db.prepare(`INSERT INTO usage_records (id, date, equipment, model, part, reason, preventive, maint_time, handler, other, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            r.id, r.date, r.equipment, r.model, r.part, r.reason, r.preventive, r.maintTime, r.handler, r.other, r.note
          );
        }
        for (const item of initData.inventoryItems) {
          db.prepare(`INSERT INTO inventory_items (id, process, equipment, name, stock, safety, safety_auto, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            item.id, item.process, item.equipment, item.name, item.stock, item.safety, item.safetyAuto ? 1 : 0, item.status || '', item.note || ''
          );
        }
        console.log(`✅ 自动初始化完成: ${initData.usageRecords.length}条履历 + ${initData.inventoryItems.length}条库存`);
      } else {
        console.log(`📊 数据库已有 ${usageCount.cnt} 条履历，跳过初始化`);
      }
    } catch (e) {
      console.error('初始化失败:', e.message);
    }
  } else {
    console.log('⚠️ 未找到 init-data.json，首次使用请调用 POST /api/init');
  }
});

module.exports = app;
