/**
 * 初始化数据脚本
 * 运行方式：node init-data.js
 * 将 seed.js 和 usage_seed.js 的数据导出为 JSON
 */

const fs = require('fs');
const path = require('path');

// 加载 seed.js
function loadSeed() {
  const seedPath = path.join(__dirname, '../spare-parts-dashboard/seed.js');
  const content = fs.readFileSync(seedPath, 'utf-8');
  
  // 在 Node 环境中执行，提取 SEED_ITEMS
  const fn = new Function(content + '; return { items: SEED_ITEMS, meta: SEED_META };');
  const { items, meta } = fn();
  return { items, meta };
}

// 加载 usage_seed.js
function loadUsage() {
  const usagePath = path.join(__dirname, '../spare-parts-dashboard/usage_seed.js');
  const content = fs.readFileSync(usagePath, 'utf-8');
  
  const fn = new Function(content + '; return { records: USAGE_SEED, meta: USAGE_SEED_META };');
  const { records, meta } = fn();
  return { records, meta };
}

// 输出初始化数据
function main() {
  try {
    const { items: inventoryItems, meta: seedMeta } = loadSeed();
    const { records: usageRecords, meta: usageMeta } = loadUsage();

    console.log(`库存数据: ${inventoryItems.length} 条`);
    console.log(`履历数据: ${usageRecords.length} 条`);
    console.log(`seed version: ${seedMeta.version}`);
    console.log(`usage version: ${usageMeta.version}`);

    const initData = {
      usageRecords: usageRecords.map(r => ({
        id: r.id,
        date: r.date,
        equipment: r.equipment,
        model: r.model,
        part: r.part,
        reason: r.reason,
        preventive: r.preventive || '',
        maintTime: r.maintTime || '',
        handler: r.handler || '',
        other: r.other || '',
        note: r.note || ''
      })),
      inventoryItems: inventoryItems.map(i => ({
        id: i.id,
        process: i.process,
        equipment: i.equipment,
        name: i.name,
        stock: i.stock,
        safety: i.safety,
        safetyAuto: i.safetyAuto !== false,
        status: i.status || '',
        note: i.note || ''
      }))
    };

    // 保存到文件
    const outFile = path.join(__dirname, 'init-data.json');
    fs.writeFileSync(outFile, JSON.stringify(initData, null, 2), 'utf-8');
    console.log(`已保存到: ${outFile}`);
    const size = fs.statSync(outFile).size;
    console.log(`文件大小: ${(size/1024).toFixed(1)} KB`);

  } catch (e) {
    console.error('错误:', e.message);
    process.exit(1);
  }
}

main();
