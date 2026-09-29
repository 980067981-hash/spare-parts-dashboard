// 简化版后端 - 使用内存存储演示
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../spare-parts-dashboard')));

// 内存数据存储（云端部署时替换为真实数据库）
let usageRecords = [
  { id: 'U1001', date: '7.21', equipment: 'DB3#', model: 'DA403D', part: 'PA PD吸嘴', reason: '百转破损？', preventive: '', maint_time: '7.21', handler: '林自科？', other: '', note: '' },
  // ... 更多数据
];

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
    cb(null, `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// ==================== API ====================

app.get('/api/usage', (req, res) => {
  res.json(usageRecords);
});

app.post('/api/usage', (req, res) => {
  const record = {
    id: req.body.id || `U${Date.now()}`,
    date: req.body.date || '',
    equipment: req.body.equipment || '',
    model: req.body.model || '',
    part: req.body.part || '',
    reason: req.body.reason || '',
    preventive: req.body.preventive || '',
    maint_time: req.body.maint_time || '',
    handler: req.body.handler || '',
    other: req.body.other || '',
    note: req.body.note || ''
  };
  usageRecords.push(record);
  res.json({ success: true, id: record.id });
});

app.delete('/api/usage/:id', (req, res) => {
  const index = usageRecords.findIndex(r => r.id === req.params.id);
  if (index > -1) {
    usageRecords.splice(index, 1);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: '记录不存在' });
  }
});

// 上传图片（暂不支持 AI 识别）
app.post('/api/upload', upload.single('image'), (req, res) => {
  res.json({
    success: true,
    filename: req.file.filename,
    message: '图片已上传，请将图片发送给我进行识别'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', records: usageRecords.length });
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});

module.exports = app;
