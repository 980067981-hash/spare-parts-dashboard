#!/usr/bin/env node
/* =====================================================================
   apply-update.mjs —— 备件耗材看板「数据更新口」
   ---------------------------------------------------------------------
   作用：把一份"变更单 JSON"应用到数据源 seed.js，并自动完成
         校验 → 备份 → 版本号 +1 → 写回。

   用法：
     node tools/apply-update.mjs <变更单.json>            正式应用
     node tools/apply-update.mjs <变更单.json> --dry-run  只预演不落盘
     node tools/apply-update.mjs --dump <输出.json>       导出当前全量数据

   变更单格式（mode 二选一）：
   ---------------------------------------------------------------
   {
     "mode": "ops",                       // 增量：按履历表/领用表增减
     "label": "10 月耦合段盘点",
     "updatedAt": "2026-10-15",
     "sources": ["耦合段配件统计(10月).xlsx"],
     "ops": [
       { "op": "delta", "name": "LD吸嘴",   "delta": -3, "reason": "领用" },
       { "op": "set",   "name": "FA400G加电板", "stock": 25, "reason": "盘点" },
       { "op": "add",   "item": { "process": "耦合段", "equipment": "—",
                                  "name": "新品", "unit": "个",
                                  "stock": 10, "safety": 3, "note": "" } },
       { "op": "meta",  "name": "某件", "set": { "safety": 8, "note": "改备注" } },
       { "op": "remove","name": "停产件" }
     ]
   }

   {
     "mode": "rebuild",                   // 全量：按统计表整表替换
     "label": "10 月全量盘点",
     "updatedAt": "2026-10-15",
     "sources": ["DBWB耗材盘点(10月).xlsx"],
     "items": [ { "process":"耦合段", "equipment":"—", "name":"…",
                  "unit":"个", "stock":10, "safety":3, "note":"" } ]
   }
   ===================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(__dirname, "..", "spare-parts-dashboard");
const BACKUP_DIR = path.join(__dirname, "backups");

/* ---------------- 参数 ---------------- */
const argv = process.argv.slice(2);
let planFile = null, dumpFile = null, targetDir = DEFAULT_DIR, dryRun = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--dry-run") { dryRun = true; continue; }
  if (a === "--dir")     { targetDir = path.resolve(argv[++i]); continue; }
  if (a === "--dump")    { dumpFile = argv[++i]; continue; }
  if (!a.startsWith("--")) planFile = a;
}
const SEED_FILE = path.join(targetDir, "seed.js");

const die = m => { console.error("\n✗ " + m + "\n"); process.exit(1); };
const norm = s => String(s == null ? "" : s).replace(/[\s\u3000]/g, "").toLowerCase();
const keyOf = i => norm(i.process) + "|" + norm(i.equipment) + "|" + norm(i.name);
const intOf = (v, dft) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : dft; };
const today = () => { const d = new Date(); const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

/* ---------------- 读写数据源 ---------------- */
function loadSeed() {
  if (!fs.existsSync(SEED_FILE)) die(`找不到数据源文件：${SEED_FILE}`);
  const src = fs.readFileSync(SEED_FILE, "utf8");
  let out;
  try {
    out = new Function(src + "\nreturn { meta: SEED_META, items: SEED_ITEMS };")();
  } catch (e) { die("数据源文件解析失败：" + e.message); }
  if (!Array.isArray(out.items)) die("数据源里 SEED_ITEMS 不是数组");
  return { src, meta: out.meta || {}, items: out.items };
}

function buildSource(src, meta, items) {
  const metaIdx = src.indexOf("const SEED_META");
  const itemsIdx = src.indexOf("const SEED_ITEMS");
  if (metaIdx < 0 || itemsIdx < 0) die("数据源结构异常：缺少 SEED_META 或 SEED_ITEMS");
  const head = src.slice(0, metaIdx);
  const comments = src.slice(metaIdx, itemsIdx).split("\n")
    .filter(l => l.trim().startsWith("//")).map(l => l.replace(/\s+$/, "")).join("\n");
  return head
    + "const SEED_META = " + JSON.stringify(meta, null, 2) + ";\n\n"
    + (comments ? comments + "\n" : "")
    + "const SEED_ITEMS = " + JSON.stringify(items, null, 2) + ";\n";
}

/* ---------------- 匹配与 id ----------------
   定位优先级：id  >  name(+equipment)(+process)  >  模糊名称
   同一物料名会出现在多台设备上，因此支持 equipment 作为二级键。
   ------------------------------------------- */
function describe(i) { return `${i.id} / ${i.equipment} / ${i.process}`; }

function locate(items, op) {
  if (op.id) {
    const hit = items.find(i => i.id === op.id);
    return hit ? { item: hit } : { error: `id「${op.id}」不存在` };
  }
  const n = norm(op.name);
  if (!n) return { error: "缺少 name（或 id）" };

  const exact = items.filter(i => norm(i.name) === n);
  if (exact.length === 1) return { item: exact[0] };

  if (exact.length > 1) {
    let pool = exact;
    if (op.equipment) {
      const eq = norm(op.equipment);
      const byEq = pool.filter(i => norm(i.equipment) === eq);
      if (byEq.length) pool = byEq;
      else return { error: `「${op.name}」在设备「${op.equipment}」下不存在，可选：` + exact.map(describe).join("、") };
    }
    if (pool.length > 1 && op.process) {
      const pr = norm(op.process);
      const byPr = pool.filter(i => norm(i.process) === pr);
      if (byPr.length) pool = byPr;
    }
    if (pool.length === 1) return { item: pool[0], soft: !op.equipment };
    return {
      error: `「${op.name}」匹配到 ${pool.length} 条，请补充 "equipment"（设备）或直接给 "id"：\n     ` +
        pool.map(describe).join("\n     ")
    };
  }

  // 没有精确同名 → 模糊
  const soft = items.filter(i => { const k = norm(i.name); return k.includes(n) || n.includes(k); });
  if (soft.length === 1) return { item: soft[0], soft: true };
  if (soft.length > 1) {
    return { error: `「${op.name}」模糊匹配到 ${soft.length} 条，请写全名或给 id：\n     ` + soft.map(describe).join("\n     ") };
  }
  return { error: `「${op.name}」在数据源中不存在` };
}

function idAllocator(items) {
  let max = 0;
  items.forEach(i => { const m = /^P(\d+)$/.exec(i.id || ""); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return () => "P" + String(++max).padStart(4, "0");
}

/* ---------------- 应用 ops ---------------- */
function applyOps(items, ops) {
  const report = [], warnings = [];
  const nextId = idAllocator(items);

  for (const op of ops) {
    if (op.op === "add") {
      const it = op.item || {};
      if (!it.name) die("add 操作缺少 item.name");
      if (!it.process) die(`add「${it.name}」缺少 process`);
      const eq = it.equipment || "—";
      const target = norm(it.process) + "|" + norm(eq) + "|" + norm(it.name);
      const dup = items.find(i => keyOf(i) === target);
      if (dup) die(`add「${it.name}」失败：${dup.process} / ${dup.equipment} 下已存在同名物料（${dup.id}）`);
      const obj = {
        id: nextId(),
        process: it.process,
        equipment: eq,
        name: it.name,
        unit: it.unit || "个",
        stock: intOf(it.stock, 0),
        safety: intOf(it.safety, 0),
        safetyAuto: !(Number(it.safety) > 0),
        note: it.note || ""
      };
      items.push(obj);
      report.push({ kind: "＋新增", name: obj.name, detail: `${obj.process} / ${obj.equipment} · 库存 ${obj.stock}` });
      continue;
    }

    const r = locate(items, op);
    if (r.error) die(`${op.op} 操作失败：${r.error}`);
    const it = r.item;
    if (r.soft) warnings.push(`「${op.name}」匹配不够精确 → 实际命中「${describe(it)}」，建议下次补全设备`);

    if (op.op === "set") {
      const before = it.stock;
      it.stock = intOf(op.stock, it.stock);
      report.push({ kind: "~改库存", name: it.name, detail: `${before} → ${it.stock}${op.reason ? "（" + op.reason + "）" : ""}` });

    } else if (op.op === "delta") {
      const before = it.stock, d = intOf(op.delta, 0);
      it.stock = before + d;
      if (it.stock < 0) die(`「${it.name}」增减后库存为负（${it.stock}），请核对数量`);
      report.push({ kind: "±增减", name: it.name, detail: `${before} → ${it.stock}（${d > 0 ? "+" : ""}${d}${op.reason ? " · " + op.reason : ""}）` });

    } else if (op.op === "meta") {
      const set = op.set || {}, changed = [];
      for (const k of ["process", "equipment", "unit", "safety", "note", "status"]) {
        if (set[k] === undefined) continue;
        const v = k === "safety" ? intOf(set[k], it.safety) : set[k];
        if (it[k] !== v) {
          changed.push(`${k}：${it[k]} → ${v}`);
          it[k] = v;
          if (k === "safety") it.safetyAuto = false;
        }
      }
      if (!changed.length) warnings.push(`「${it.name}」的 meta 操作无实际变化`);
      else report.push({ kind: "~改属性", name: it.name, detail: changed.join("；") });

    } else if (op.op === "remove") {
      const idx = items.indexOf(it);
      items.splice(idx, 1);
      report.push({ kind: "－删除", name: it.name, detail: `原库存 ${it.stock}` });

    } else {
      die(`不支持的 op 类型：${op.op}`);
    }
  }
  return { report, warnings };
}

/* ---------------- 全量重建 ---------------- */
function rebuildItems(prevItems, rawItems) {
  const byKey = new Map(prevItems.map(i => [keyOf(i), i]));
  const next = [];
  for (const raw of rawItems) {
    if (!raw || !raw.name) die("rebuild 的 items 中存在缺少 name 的条目");
    if (!raw.process) die(`rebuild「${raw.name}」缺少 process`);
    const eq = raw.equipment || "—";
    const old = byKey.get(norm(raw.process) + "|" + norm(eq) + "|" + norm(raw.name));
    next.push({
      id: old ? old.id : null,
      process: raw.process,
      equipment: eq,
      name: raw.name,
      unit: raw.unit || (old && old.unit) || "个",
      stock: intOf(raw.stock, 0),
      safety: intOf(raw.safety, old ? old.safety : 0),
      safetyAuto: raw.safety == null ? !!(old && old.safetyAuto) : !(Number(raw.safety) > 0),
      note: raw.note || (old && old.note) || ""
    });
  }
  const nextId = idAllocator(prevItems);
  next.forEach(n => { if (!n.id) n.id = nextId(); });
  return next;
}

/* ---------------- 校验 ---------------- */
function validate(items) {
  const errs = [];
  const idSeen = new Set(), keySeen = new Map();
  items.forEach((i, idx) => {
    const tag = i.name || `第${idx + 1}条`;
    if (!i.id) errs.push(`${tag} 缺少 id`);
    else if (idSeen.has(i.id)) errs.push(`id 重复：${i.id}`);
    idSeen.add(i.id);

    // 唯一键 = 工序 + 设备 + 物料名（同名物料可装在不同设备上，属正常）
    if (!norm(i.name)) errs.push(`第 ${idx + 1} 条缺少名称`);
    else {
      const key = norm(i.process) + "|" + norm(i.equipment) + "|" + norm(i.name);
      if (keySeen.has(key)) errs.push(`重复条目：${i.process} / ${i.equipment} / ${i.name}（与第 ${keySeen.get(key) + 1} 条完全重复）`);
      else keySeen.set(key, idx);
    }

    if (!Number.isInteger(i.stock) || i.stock < 0) errs.push(`「${tag}」库存不是非负整数：${i.stock}`);
    if (!Number.isInteger(i.safety) || i.safety < 0) errs.push(`「${tag}」安全库存不是非负整数：${i.safety}`);
    if (/合计|小计|总计|汇总|^\d+\s*种$/.test(String(i.name))) errs.push(`「${tag}」疑似合计/汇总行，不应作为备件条目`);
  });
  return errs;
}

/* ---------------- 主流程 ---------------- */
const { src, meta: prevMeta, items: prevItems } = loadSeed();

if (dumpFile) {
  const payload = {
    version: prevMeta.version, updatedAt: prevMeta.updatedAt,
    label: prevMeta.label, sources: prevMeta.sources, items: prevItems
  };
  fs.writeFileSync(path.resolve(dumpFile), JSON.stringify(payload, null, 2), "utf8");
  console.log(`✓ 已导出 ${prevItems.length} 条数据 → ${path.resolve(dumpFile)}`);
  process.exit(0);
}

if (!planFile) die("请指定变更单 JSON：node tools/apply-update.mjs <变更单.json>");
const planPath = path.resolve(planFile);
if (!fs.existsSync(planPath)) die(`找不到变更单：${planPath}`);

let plan;
try { plan = JSON.parse(fs.readFileSync(planPath, "utf8")); }
catch (e) { die("变更单不是合法 JSON：" + e.message); }

const mode = plan.mode || (Array.isArray(plan.items) ? "rebuild" : "ops");
let nextItems = prevItems.map(i => ({ ...i }));
let report = [], warnings = [];

if (mode === "ops") {
  if (!Array.isArray(plan.ops) || !plan.ops.length) die("ops 模式需要非空 ops 数组");
  ({ report, warnings } = applyOps(nextItems, plan.ops));
} else if (mode === "rebuild") {
  if (!Array.isArray(plan.items) || !plan.items.length) die("rebuild 模式需要非空 items 数组");
  const beforeKeys = new Set(prevItems.map(keyOf));
  nextItems = rebuildItems(prevItems, plan.items);
  const afterKeys = new Set(nextItems.map(keyOf));
  nextItems.forEach(i => { if (!beforeKeys.has(keyOf(i))) report.push({ kind: "＋新增", name: i.name, detail: `${i.process} / ${i.equipment} · 库存 ${i.stock}` }); });
  prevItems.forEach(i => { if (!afterKeys.has(keyOf(i))) report.push({ kind: "－删除", name: i.name, detail: `${i.process} / ${i.equipment} · 原库存 ${i.stock}` }); });
  const oldByKey = new Map(prevItems.map(i => [keyOf(i), i]));
  nextItems.forEach(i => {
    const old = oldByKey.get(keyOf(i));
    if (old && old.stock !== i.stock) report.push({ kind: "~改库存", name: i.name, detail: `${old.equipment} · ${old.stock} → ${i.stock}` });
  });
} else {
  die(`未知 mode：${mode}`);
}

const errs = validate(nextItems);
if (errs.length) {
  console.error("\n✗ 校验未通过，已中止，数据源未改动：");
  errs.forEach(e => console.error("   · " + e));
  console.error("");
  process.exit(1);
}

/* 汇总 */
const sum = a => a.reduce((x, y) => x + y.stock, 0);
const procs = [...new Set(nextItems.map(i => i.process))];

console.log("\n════════ 变更预览 ════════");
console.log(`模式：${mode === "ops" ? "增量（ops）" : "全量（rebuild）"}   变更条数：${report.length}`);
console.log(`条目：${prevItems.length} → ${nextItems.length}      总库存：${sum(prevItems)} → ${sum(nextItems)}`);
console.log(`工序：${procs.map(p => `${p}(${nextItems.filter(i => i.process === p).length})`).join("  ")}`);
if (report.length) {
  console.log("─────────────────────────");
  report.forEach(r => console.log(`  ${r.kind}  ${r.name}  ${r.detail}`));
}
if (warnings.length) {
  console.log("──────── 提示 ────────");
  warnings.forEach(w => console.log(`  ⚠ ${w}`));
}

if (dryRun) { console.log("\n(预演模式，未写入任何文件)\n"); process.exit(0); }

/* 备份 + 写回 */
const newVersion = (Number(prevMeta.version) || 0) + 1;
const newMeta = {
  version: newVersion,
  updatedAt: plan.updatedAt || today(),
  label: plan.label || `数据更新 v${newVersion}`,
  sources: plan.sources || prevMeta.sources || []
};

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupFile = path.join(BACKUP_DIR, `seed.v${Number(prevMeta.version) || 0}-${stamp}.js`);
fs.copyFileSync(SEED_FILE, backupFile);
fs.writeFileSync(SEED_FILE, buildSource(src, newMeta, nextItems), "utf8");

console.log("─────────────────────────");
console.log(`✓ 数据源已更新：v${prevMeta.version} → v${newVersion}（${newMeta.updatedAt}）`);
console.log(`✓ 备份：${backupFile}`);
console.log(`✓ 写回：${SEED_FILE}`);
console.log("  页面下次打开会自动同步，浏览器里的历史流水保留。\n");
