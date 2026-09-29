(function(){
  "use strict";

  /* ============================================================
     存储与数据版本
     · localStorage 使用固定 key，不再靠更换 key 让新数据生效
     · 数据版本读自 seed.js 的 SEED_META.version
     · 本地版本 < 数据源版本时自动同步：库存以数据源为准，
       历史流水（logs）保留，并写入一条"数据源同步"流水
     ============================================================ */
  const STORE_KEY = "spare_parts_dashboard";
  const LEGACY_KEYS = [
    { key:"spare_parts_dashboard_v2", seedVersion:2 },
    { key:"spare_parts_dashboard_v1", seedVersion:1 }
  ];
  const META = (typeof SEED_META !== "undefined" && SEED_META)
    ? SEED_META : { version:0, updatedAt:"—", label:"", sources:[] };
  const SEED_VERSION = Number(META.version) || 0;
  const USAGE_META = (typeof USAGE_SEED_META !== "undefined" && USAGE_SEED_META)
    ? USAGE_SEED_META : { version:0 };
  const USAGE_VERSION = Number(USAGE_META.version) || 0;

  let items = [], logs = [];
  let usage = [];
  let localSeedVersion = 0;
  let localSeedFp = "";
  let localUsageVersion = 0;
  let filter = { q:"", process:"", onlyLow:false };
  let lFilter = { q:"", process:"" };
  let uFilter = { q:"", equipment:"", part:"" };
  let uSort = { field: "date", dir: -1 }; // 默认日期降序（新→旧）
  // 预设设备列表（按机台类型分组）
  const EQUIPMENT_LIST = [
    // DB 系列
    { value:"DB1#", label:"DB1#（创世杰 T6000）" },
    { value:"DB2#", label:"DB2#（微见智能 15D）" },
    { value:"DB3#", label:"DB3#（普莱信 DA403）" },
    { value:"DB4#", label:"DB4#（普莱信 DA403）" },
    // WB 系列
    { value:"WB1#", label:"WB1#（ASM AERO）" },
    { value:"WB2#", label:"WB2#（ASM AERO）" },
    // LENS 系列
    { value:"LENS2#", label:"LENS2#" },
    { value:"LENS3#", label:"LENS3#" },
    { value:"LENS4#", label:"LENS4#" },
    // FA 系列
    { value:"FA1#", label:"FA1#" },
    { value:"FA2#", label:"FA2#" },
    { value:"FA3#", label:"FA3#" },
    { value:"FA4#", label:"FA4#" },
    { value:"FA5#", label:"FA5#" },
    { value:"FA6#", label:"FA6#" },
    { value:"FA7#", label:"FA7#" },
    { value:"FA8#", label:"FA8#" },
  ];
  let importPreview = [];
  let ioItem = null, ioDir = "in";
  let editItem = null;
  let editUsage = null;
  let ocrPreview = [];

  function $(s){ return document.querySelector(s); }
  function $$(s){ return Array.from(document.querySelectorAll(s)); }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
  function fmtNum(n){ return Number.isInteger(n) ? n : Number(n).toFixed(2); }
  function nowStr(){ return new Date().toLocaleString("zh-CN", { hour12:false }); }

  function init(){
    const hadData = loadState();
    // 无本地数据、或数据源版本/内容变化过 → 以数据源为准同步
    // （指纹比对兜底：版本相同但条目内容变动时也能刷到最新）
    if (!hadData || localSeedVersion < SEED_VERSION || localSeedFp !== seedFingerprint()){
      syncFromSeed(hadData);
    } else {
      save();
    }
    seedUsage();
    bindTabs();
    bindDashboard();
    bindLedger();
    bindImport();
    bindUsage();
    bindLog();
    bindModals();
    renderAll();
    renderMeta();
    $("#connCount").textContent = items.length;
  }

  /* 数据源内容指纹：同版本但条目有改动（库存/安全值/状态）时也能检测出来 */
  function seedFingerprint(){
    const list = (typeof SEED_ITEMS !== "undefined") ? SEED_ITEMS : [];
    const sig = list.map(i =>
      i.id + "|" + i.stock + "|" + i.safety + "|" + (i.safetyAuto ? 0 : 1) + "|" + (i.status || "")
    ).join(",");
    let h = 5381;
    for (let i = 0; i < sig.length; i++){ h = ((h << 5) + h + sig.charCodeAt(i)) | 0; }
    return "v" + SEED_VERSION + "#" + (h >>> 0).toString(36);
  }

  /* 读取本地数据；返回本地是否已有数据 */
  function loadState(){
    let raw = localStorage.getItem(STORE_KEY);
    if (!raw){
      for (const l of LEGACY_KEYS){
        const legacy = localStorage.getItem(l.key);
        if (legacy){
          raw = legacy;
          localSeedVersion = l.seedVersion;
          try{ localStorage.removeItem(l.key); }catch(e){}
          break;
        }
      }
    }
    if (!raw) return false;
    try{
      const d = JSON.parse(raw);
      items = d.items || [];
      logs  = d.logs  || [];
      usage = d.usage || [];
      if (d.seedVersion != null) localSeedVersion = Number(d.seedVersion) || 0;
      if (d.usageVersion != null) localUsageVersion = Number(d.usageVersion) || 0;
      localSeedFp = d.seedFp || "";
      if (d.uSort && typeof d.uSort.field === "string") uSort = { field: d.uSort.field, dir: d.uSort.dir === 1 ? 1 : -1 };
    }catch(e){ console.error("本地数据解析失败，将回退到数据源", e); }
    return items.length > 0;
  }

  /* 以数据源为准同步（保留流水） */
  function syncFromSeed(notify){
    if (typeof SEED_ITEMS === "undefined" || !SEED_ITEMS.length){
      console.error("数据源 seed.js 未加载或为空，无法同步");
      return;
    }
    const prev = items.slice();
    const prevCount = prev.length;
    const prevById = {};
    prev.forEach(i => { prevById[i.id] = i; });

    items = JSON.parse(JSON.stringify(SEED_ITEMS));

    let added = 0, removed = 0, changed = 0;
    const nextIds = {};
    items.forEach(i => {
      nextIds[i.id] = true;
      const old = prevById[i.id];
      if (!old) added++;
      else if (old.stock !== i.stock) changed++;
    });
    prev.forEach(i => { if (!nextIds[i.id]) removed++; });

    if (notify){
      logs.unshift({
        id: "L" + Date.now().toString(36),
        time: nowStr(),
        itemId: "_sync",
        name: "数据源同步",
        process: "全部工序",
        equipment: "—",
        type: "edit",
        delta: 0,
        memo: `数据源更新至 v${SEED_VERSION}（${META.updatedAt}）· 新增 ${added} / 移除 ${removed} / 数量变动 ${changed}`,
        before: prevCount,
        after: items.length
      });
      showSyncBar({ added, removed, changed, prevCount });
    }

    localSeedVersion = SEED_VERSION;
    localSeedFp = seedFingerprint();
    save();
  }

  /* 加载/同步使用履历数据（来自 usage_seed.js）
     · 首次无数据 → 导入预置
     · 本地版本 < 数据源版本（人工核对更正过）→ 以数据源为准刷新，
       并写一条流水；不触碰库存 seed.js */
  function seedUsage(){
    const needSeed = (typeof USAGE_SEED !== "undefined" && USAGE_SEED.length);
    if (!usage.length && needSeed){
      usage = JSON.parse(JSON.stringify(USAGE_SEED));
      localUsageVersion = USAGE_VERSION;
      save();
      return;
    }
    if (needSeed && localUsageVersion < USAGE_VERSION){
      const prevCount = usage.length;
      usage = JSON.parse(JSON.stringify(USAGE_SEED));
      localUsageVersion = USAGE_VERSION;
      logs.unshift({
        id: "L" + Date.now().toString(36),
        time: nowStr(),
        itemId: "_usage",
        name: "使用履历更正同步",
        process: "DB3#",
        equipment: "DA403D",
        type: "edit",
        delta: 0,
        memo: `使用履历数据源更新至 v${USAGE_VERSION}（${USAGE_META.correctedAt || USAGE_META.transcribedAt || "—"}）：${prevCount} → ${usage.length} 条，已按人工核对结果刷新`,
        before: prevCount,
        after: usage.length
      });
      save();
      showSyncBar({ added:0, removed:0, changed:prevCount, prevCount, usage:true });
    }
  }

  function save(){
    localStorage.setItem(STORE_KEY, JSON.stringify({ seedVersion: localSeedVersion, seedFp: localSeedFp, usageVersion: localUsageVersion, uSort, items, logs, usage }));
  }

  /* ---------- 数据版本展示 ---------- */
  function renderMeta(){
    const el = $("#metaLine");
    if (!el) return;
    el.textContent = `数据版本 v${SEED_VERSION} · 更新于 ${META.updatedAt}`;
    if (META.label) el.textContent += ` · ${META.label}`;
    if (META.sources && META.sources.length) el.title = "数据来源：" + META.sources.join("、");
  }

  function showSyncBar(info){
    const bar = $("#syncBar");
    if (!bar) return;
    let txt;
    if (info.usage){
      txt = `使用履历数据源已更新至 <b>v${USAGE_VERSION}</b>（${esc(USAGE_META.correctedAt || USAGE_META.transcribedAt || "—")}）：共 <b>${info.changed || 0}</b> 条记录已按人工核对结果刷新。`;
    } else {
      const changedAny = info.added || info.removed || info.changed;
      txt = `数据源已更新至 <b>v${SEED_VERSION}</b>（${esc(META.updatedAt)}）：` +
        (changedAny
          ? `新增 <b>${info.added}</b> 条、移除 <b>${info.removed}</b> 条、数量变动 <b>${info.changed}</b> 条。`
          : `条目与上次一致，已刷新版本标记。`) +
        `库存以数据源为准，历史流水已保留。`;
    }
    bar.innerHTML =
      `<span class="sync-ico">↻</span>` +
      `<span class="sync-txt">${txt}</span>` +
      `<button class="sync-close" type="button">知道了</button>`;
    bar.style.display = "flex";
    const btn = bar.querySelector(".sync-close");
    if (btn) btn.addEventListener("click", () => { bar.style.display = "none"; });
  }

  /* ---------- 状态 ---------- */
  function statusOf(it){
    const gap = it.stock - it.safety;
    if (it.safety > 0 && gap < 0) return { key:"low", label:"低于安全库存", gap };
    if (it.safety > 0 && gap === 0) return { key:"warn", label:"触及安全线", gap };
    if (it.safety > 0 && gap <= Math.max(1, Math.ceil(it.safety * 0.2))) return { key:"warn", label:"偏低预警", gap };
    if (it.safety > 0) return { key:"ok", label:"充足", gap };
    return { key:"none", label:"未设标准", gap:null };
  }

  function addLog(it, type, delta, memo, before, after){
    const entry = {
      id: "L" + Date.now().toString(36),
      time: new Date().toLocaleString("zh-CN", { hour12:false }),
      itemId: it.id,
      name: it.name,
      process: it.process,
      equipment: it.equipment,
      type,
      delta,
      memo: memo || "",
      before: before != null ? before : it.stock - delta,
      after: after != null ? after : it.stock
    };
    logs.unshift(entry);
    save();
  }

  /* ---------- Tabs ---------- */
  function bindTabs(){
    $$(".tab").forEach(btn => {
      btn.addEventListener("click", () => {
        $$(".tab").forEach(b => b.classList.remove("active"));
        $$(".panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        $("#" + btn.dataset.tab).classList.add("active");
        renderAll();
      });
    });
  }

  /* ---------- Dashboard ---------- */
  function bindDashboard(){
    $("#dQ").addEventListener("input", e => { filter.q = e.target.value.trim(); renderDashboard(); });
    $("#dProc").addEventListener("change", e => { filter.process = e.target.value; renderDashboard(); });
    $("#dLow").addEventListener("change", e => { filter.onlyLow = e.target.checked; renderDashboard(); });
  }

  function renderEquipCards(){
    // 提取设备组：process + equipment
    const eqGroups = {};
    items.forEach(it => {
      const key = `${it.process}||${it.equipment}`;
      if (!eqGroups[key]) eqGroups[key] = { process: it.process, equipment: it.equipment, items: [], status: it.status };
      eqGroups[key].items.push(it);
    });

    let html = "";
    Object.values(eqGroups).forEach(g => {
      const total = g.items.length;
      const lowCount = g.items.filter(it => statusOf(it).key === "low").length;
      const warnCount = g.items.filter(it => { const s = statusOf(it); return s.key === "warn"; }).length;
      const okCount = total - lowCount - warnCount;

      // 状态徽章
      let badgeClass = "normal";
      if (g.status && g.status.includes("主产")) badgeClass = "main";
      else if (g.status && g.status.includes("非生产")) badgeClass = "low";

      // 库存充足率：达标的物料占比（低于/触及安全线的都不算达标）
      const rate = total ? Math.round(okCount / total * 100) : 0;
      const barCls = rate >= 60 ? "good" : rate >= 30 ? "mid" : "bad";

      html += `<div class="equip-card">
        <div class="equip-card-head">
          <span class="equip-name">${esc(g.equipment)}</span>
          ${g.status ? `<span class="equip-badge ${badgeClass}" title="${esc(g.status)}">${esc(g.status.replace(/[，,].*$/, "").slice(0, 10))}</span>` : ""}
        </div>
        ${g.status ? `<div class="equip-sub">${esc(g.status)}</div>` : ""}
        <div class="equip-meta">
          <span class="equip-stat">物料 <b>${total}</b> 项</span>
          <span class="equip-stat" style="color:var(--danger)">缺 <b>${lowCount}</b></span>
          <span class="equip-stat" style="color:var(--warn)">警 <b>${warnCount}</b></span>
          <span class="equip-stat" style="color:var(--ok)">足 <b>${okCount}</b></span>
        </div>
        <div class="equip-rate-row"><span>库存充足率</span><b>${rate}%</b></div>
        <div class="equip-bar-bg"><div class="equip-bar ${barCls}" style="width:${rate}%"></div></div>
      </div>`;
    });
    const el = $("#equipStatusCards");
    if (el) el.innerHTML = html;
  }

  function renderDashboard(){
    renderEquipCards();
    const procs = [...new Set(items.map(i => i.process))];
    const sel = $("#dProc");
    if (!sel.options.length){
      sel.innerHTML = `<option value="">全部工序</option>` + procs.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
    }

    const q = filter.q.toLowerCase();
    const groups = {};
    items.forEach(it => {
      if (filter.process && it.process !== filter.process) return;
      if (q && !(it.name + it.equipment + it.process).toLowerCase().includes(q)) return;
      const s = statusOf(it);
      if (filter.onlyLow && s.key !== "low") return;
      if (!groups[it.process]) groups[it.process] = [];
      groups[it.process].push(it);
    });

    let html = "";
    Object.keys(groups).forEach(proc => {
      const rows = groups[proc];
      const lowCount = rows.filter(it => statusOf(it).key === "low").length;
      html += `<div class="proc-card">
        <div class="proc-header">
          <div>
            <h3>${esc(proc)}</h3>
            <div class="proc-meta">${rows.length} 项物料 · ${lowCount ? `<span style="color:var(--danger);font-weight:700">${lowCount} 项缺货</span>` : "库存正常"}</div>
          </div>
        </div>
        <table class="proc-table">
          <thead>
            <tr>
              <th>物料名称</th>
              <th>设备/机台</th>
              <th class="num">当前库存</th>
              <th class="num">安全库存</th>
              <th class="num">差值</th>
              <th class="num">使用次数</th>
              <th>状态</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>`;
      rows.sort((a,b) => statusOf(a).gap - statusOf(b).gap).forEach(it => {
        const s = statusOf(it);
        const gapTxt = s.gap == null ? "—" : (s.gap < 0 ? `<span class="gap-neg">${s.gap}</span>` : `<span class="gap-pos">+${s.gap}</span>`);
        const safetyCls = it.safetyAuto ? "safety-auto" : "safety-manual";
        const safetyTxt = it.safety > 0 ? (it.safetyAuto ? `${fmtNum(it.safety)} <small>默认</small>` : fmtNum(it.safety)) : "—";
        html += `<tr class="${s.key === "low" ? "rowlow" : ""}">
          <td><b>${esc(it.name)}</b></td>
          <td><span class="eq-chip">${esc(it.equipment)}</span></td>
          <td class="num">${fmtNum(it.stock)} <small>${esc(it.unit)}</small></td>
        <td class="num ${safetyCls}">${safetyTxt}</td>
        <td class="num">${gapTxt}</td>
        <td class="num">${usageCountOf(it.name) || `<span style="color:var(--muted)">0</span>`}</td>
        <td><span class="status ${s.key}">${s.label}</span></td>
          <td style="color:var(--muted)">${esc(it.note || "")}</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    });
    if (!html) html = `<div class="card" style="text-align:center;color:var(--muted);padding:60px">没有匹配到数据</div>`;
    $("#dashBody").innerHTML = html;
  }

  /* ---------- Ledger ---------- */
  function bindLedger(){
    $("#lQ").addEventListener("input", e => { lFilter.q = e.target.value.trim(); renderLedger(); });
    $("#lProc").addEventListener("change", e => { lFilter.process = e.target.value; renderLedger(); });
    $("#btnAdd").addEventListener("click", () => openItemModal(null));
    $("#btnBatch").addEventListener("click", openBatchModal);
    $("#btnExport").addEventListener("click", exportExcel);
    $("#ledgerTable tbody").addEventListener("dblclick", e => {
      const cell = e.target.closest("[data-edit]");
      if (!cell) return;
      inlineEdit(cell.dataset.id, cell.dataset.edit, cell);
    });
    $("#ledgerTable tbody").addEventListener("click", e => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.act === "in") openIOModal(id, "in");
      else if (btn.dataset.act === "out") openIOModal(id, "out");
      else if (btn.dataset.act === "edit") openItemModal(items.find(i => i.id === id));
      else if (btn.dataset.act === "del") deleteItem(id);
    });
  }

  function renderLedger(){
    const procs = [...new Set(items.map(i => i.process))];
    const sel = $("#lProc");
    if (!sel.options.length){
      sel.innerHTML = `<option value="">全部工序</option>` + procs.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
    }
    const q = lFilter.q.toLowerCase();
    let rows = items.filter(it => {
      if (lFilter.process && it.process !== lFilter.process) return false;
      if (q && !(it.name + it.equipment + it.process + (it.note||"")).toLowerCase().includes(q)) return false;
      return true;
    });
    rows.sort((a,b) => statusOf(a).gap - statusOf(b).gap);

    let html = "";
    rows.forEach(it => {
      const s = statusOf(it);
      const gapTxt = s.gap == null ? "—" : (s.gap < 0 ? `<span class="gap-neg">${s.gap}</span>` : `<span class="gap-pos">+${s.gap}</span>`);
      const safetyCls = it.safetyAuto ? "safety-auto" : "safety-manual";
      const safetyTxt = it.safety > 0 ? (it.safetyAuto ? `${fmtNum(it.safety)} <small>默认</small>` : fmtNum(it.safety)) : "—";
      html += `<tr class="${s.key === "low" ? "rowlow" : ""}">
        <td>${esc(it.process)}</td>
        <td>${esc(it.equipment)}</td>
        <td><b>${esc(it.name)}</b></td>
        <td>${esc(it.unit)}</td>
        <td class="num editable" data-edit="stock" data-id="${it.id}" title="双击修改">${fmtNum(it.stock)}</td>
        <td class="num editable ${safetyCls}" data-edit="safety" data-id="${it.id}" title="双击修改">${safetyTxt}</td>
        <td class="num">${gapTxt}</td>
        <td><span class="status ${s.key}">${s.label}</span></td>
        <td style="color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis">${esc(it.note || "")}</td>
        <td>
          <button class="btn sm primary" data-act="in" data-id="${it.id}">入库</button>
          <button class="btn sm secondary" data-act="out" data-id="${it.id}">出库</button>
          <button class="btn sm ghost" data-act="edit" data-id="${it.id}">编辑</button>
          <button class="btn sm ghost" data-act="del" data-id="${it.id}">删除</button>
        </td>
      </tr>`;
    });
    $("#ledgerTable tbody").innerHTML = html || `<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:40px">没有匹配到数据</td></tr>`;
  }

  function inlineEdit(id, field, cell){
    const it = items.find(i => i.id === id); if (!it) return;
    const old = it[field];
    const input = document.createElement("input");
    input.type = "number"; input.value = it[field]; input.className = "input";
    input.style.width = "80px"; input.style.height = "30px"; input.style.padding = "0 6px";
    cell.innerHTML = ""; cell.appendChild(input); input.focus(); input.select();
    function finish(){
      const v = input.value.trim();
      if (v === "") { renderLedger(); return; }
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 0) { toast("请输入非负整数"); renderLedger(); return; }
      if (n !== old){
        it[field] = n;
        if (field === "safety") it.safetyAuto = false;
        save();
        if (field === "stock") addLog(it, "edit", n - old, `直接修改库存为${n}`, old, n);
        else if (field === "safety") addLog(it, "edit", 0, `修改安全库存为${n}`);
      }
      renderAll();
    }
    input.addEventListener("blur", finish);
    input.addEventListener("keydown", e => { if (e.key === "Enter") finish(); if (e.key === "Escape") renderLedger(); });
  }

  function deleteItem(id){
    const it = items.find(i => i.id === id);
    if (!it || !confirm(`确定删除「${it.name}」?`)) return;
    items = items.filter(i => i.id !== id);
    addLog(it, "edit", 0, "删除物料");
    save(); renderAll();
  }

  function exportExcel(){
    const rows = [["工序","设备/机台","物料名称","单位","当前库存","安全库存","安全线来源","差值","状态","备注"]];
    items.forEach(it => {
      const s = statusOf(it);
      rows.push([it.process, it.equipment, it.name, it.unit, it.stock, it.safety, it.safetyAuto ? "默认(5)" : "手动设定", s.gap == null ? "—" : s.gap, s.label, it.note]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "库存台账");
    XLSX.writeFile(wb, `备件耗材台账_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast("已导出 Excel");
  }

  /* ---------- Modals ---------- */
  function bindModals(){
    $$("[data-close]").forEach(b => b.addEventListener("click", closeModals));
    $$(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) closeModals(); }));

    // Usage modal
    $("#btnSaveUsage").addEventListener("click", saveUsageFromModal);

    // OCR import modal - simplified flow: paste image → auto-copy to clipboard → I recognize → you paste JSON → editable table → import
    $("#btnOcrRecognize").addEventListener("click", recognizeOcrImage);
    $("#btnOcrClearImg").addEventListener("click", clearOcrImage);
    $("#btnOcrPreview").addEventListener("click", previewOcr);
    $("#btnOcrApply").addEventListener("click", applyOcr);
    $("#btnOcrCancel").addEventListener("click", () => { ocrPreview = []; $("#ocrResultBox").style.display = "none"; });
    // Paste image support
    document.addEventListener("paste", e => {
      const modal = $("#ocrModal");
      if (!modal || !modal.classList.contains("show")) return;
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (const item of items) {
        if (item.type.indexOf("image") !== -1) {
          e.preventDefault();
          const blob = item.getAsFile();
          showOcrImage(blob);
          return;
        }
      }
    });
    // Drag and drop
    const dz = $("#ocrImageArea");
    if (dz) {
      dz.addEventListener("dragover", e => { e.preventDefault(); dz.style.borderColor = "var(--primary)"; });
      dz.addEventListener("dragleave", () => { dz.style.borderColor = ""; });
      dz.addEventListener("drop", e => {
        e.preventDefault();
        dz.style.borderColor = "";
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) showOcrImage(file);
      });
    }

    // Item modal
    $("#btnSaveItem").addEventListener("click", () => {
      const name = $("#iName").value.trim();
      if (!name) { toast("物料名称必填"); return; }
      const obj = {
        process: $("#iProc").value.trim() || "未分类",
        equipment: $("#iEq").value.trim() || "—",
        name, unit: $("#iUnit").value.trim() || "个",
        stock: parseInt($("#iStock").value, 10) || 0,
        safety: parseInt($("#iSafety").value, 10) || 0,
        note: $("#iNote").value.trim()
      };
      if (editItem){
        const oldSafety = editItem.safety;
        Object.assign(editItem, obj);
        editItem.safetyAuto = false;
        save();
        if (editItem.stock !== obj.stock) addLog(editItem, "edit", obj.stock - editItem.stock, `编辑后库存为${obj.stock}`);
        if (editItem.safety !== oldSafety) addLog(editItem, "edit", 0, `编辑后安全库存为${editItem.safety}`);
      } else {
        obj.id = "P" + Date.now().toString().slice(-7);
        obj.safetyAuto = obj.safety > 0 ? false : true;
        items.push(obj);
        addLog(obj, "add", obj.stock, "新增物料");
        save();
      }
      closeModals(); renderAll();
    });

    // IO modal
    $("#btnConfirmIO").addEventListener("click", () => {
      if (!ioItem) return;
      const qty = parseInt($("#ioQty").value, 10);
      if (isNaN(qty) || qty <= 0) { toast("请输入正整数"); return; }
      const ref = $("#ioRef").value.trim();
      const before = ioItem.stock;
      if (ioDir === "in"){
        ioItem.stock += qty;
        addLog(ioItem, "in", qty, `入库${ref ? " · " + ref : ""}`, before, ioItem.stock);
      } else {
        if (qty > ioItem.stock) { toast(`库存不足，当前只有 ${ioItem.stock}`); return; }
        ioItem.stock -= qty;
        addLog(ioItem, "out", -qty, `出库${ref ? " · " + ref : ""}`, before, ioItem.stock);
      }
      save(); closeModals(); renderAll();
    });

    // Batch modal
    $("#btnApplyBatch").addEventListener("click", () => {
      const scope = $("#bScope").value;
      const val = parseInt($("#bVal").value, 10);
      if (isNaN(val) || val < 0) { toast("请输入非负整数"); return; }
      let n = 0;
      items.forEach(it => {
        if (scope && it.process !== scope) return;
        it.safety = val; it.safetyAuto = false; n++;
      });
      save();
      addLog({ id:"_", name:"批量校准", process:scope||"全部", equipment:"—" }, "edit", 0, `批量设置安全库存为${val}，共${n}项`);
      closeModals(); renderAll();
      toast(`已更新 ${n} 项安全库存`);
    });
  }

  function openItemModal(it){
    editItem = it || null;
    $("#itemModalTitle").textContent = it ? "编辑物料" : "新增物料";
    $("#iProc").value = it ? it.process : "";
    $("#iEq").value = it ? it.equipment : "";
    $("#iName").value = it ? it.name : "";
    $("#iUnit").value = it ? it.unit : "个";
    $("#iStock").value = it ? it.stock : 0;
    $("#iSafety").value = it ? it.safety : 5;
    $("#iNote").value = it ? it.note : "";
    $("#itemModal").classList.add("show");
  }

  function openIOModal(id, dir){
    ioItem = items.find(i => i.id === id);
    ioDir = dir;
    $("#ioTitle").textContent = dir === "in" ? "入库" : "出库";
    $("#ioItemName").innerHTML = `<b>${esc(ioItem.name)}</b>（当前库存 ${fmtNum(ioItem.stock)} ${esc(ioItem.unit)}）`;
    $("#ioQty").value = 1;
    $("#ioRef").value = "";
    $("#ioModal").classList.add("show");
  }

  function openBatchModal(){
    const sel = $("#bScope");
    const procs = [...new Set(items.map(i => i.process))];
    sel.innerHTML = `<option value="">全部工序（${items.length}项）</option>` + procs.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
    $("#batchModal").classList.add("show");
  }

  function closeModals(){
    $$(".modal").forEach(m => m.classList.remove("show"));
    ioItem = null; editItem = null;
  }

  /* ---------- Import ---------- */
  function bindImport(){
    const dz = $("#dropZone"), fi = $("#fileInput");
    dz.addEventListener("click", () => fi.click());
    dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("dragover"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
    dz.addEventListener("drop", e => {
      e.preventDefault(); dz.classList.remove("dragover");
      const f = e.dataTransfer.files[0]; if (f) handleFile(f);
    });
    fi.addEventListener("change", e => { const f = e.target.files[0]; if (f) handleFile(f); });
    $("#btnPreview").addEventListener("click", previewImport);
    $("#btnApply").addEventListener("click", applyImport);
    $("#btnCancelPreview").addEventListener("click", () => { $("#previewCard").style.display = "none"; importPreview = []; });
  }

  let lastSheet = null;
  function handleFile(file){
    const reader = new FileReader();
    reader.onload = e => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type:"array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      lastSheet = sheet;
      const json = XLSX.utils.sheet_to_json(sheet, { header:1, defval:"" });
      populateColumns(json);
      toast(`已读取「${file.name}」，共 ${json.length} 行`);
    };
    reader.readAsArrayBuffer(file);
  }

  function populateColumns(rows){
    if (!rows || !rows.length) return;
    const headerIdx = Math.max(1, parseInt($("#mHeader").value, 10) || 1) - 1;
    const header = rows[headerIdx] || [];
    const opts = header.map((h,i) => `<option value="${i}">${esc(h || `列${i+1}`)}</option>`).join("");
    $("#mName").innerHTML = opts;
    $("#mQty").innerHTML = opts;
    // guess
    const nameIdx = header.findIndex(h => /物料|名称|品名|备件|配件/.test(h));
    const qtyIdx = header.findIndex(h => /数量|领用|使用|出库|入库/.test(h));
    if (nameIdx >= 0) $("#mName").value = nameIdx;
    if (qtyIdx >= 0) $("#mQty").value = qtyIdx;
  }

  function previewImport(){
    if (!lastSheet) { toast("请先上传 Excel"); return; }
    const headerIdx = Math.max(1, parseInt($("#mHeader").value, 10) || 1) - 1;
    const rows = XLSX.utils.sheet_to_json(lastSheet, { header:1, defval:"" });
    const nameCol = parseInt($("#mName").value, 10);
    const qtyCol = parseInt($("#mQty").value, 10);
    const dir = $("#mDir").value;
    importPreview = [];
    for (let i = headerIdx + 1; i < rows.length; i++){
      const r = rows[i];
      const name = String(r[nameCol] || "").trim();
      const qtyRaw = r[qtyCol];
      const qty = parseFloat(qtyRaw);
      if (!name || isNaN(qty) || qty === 0) continue;
      const matches = items.filter(it => name.includes(it.name) || it.name.includes(name));
      const it = matches[0];
      const delta = dir === "in" ? qty : -qty;
      importPreview.push({ row:i+1, name, qty, item:it, delta, newStock: it ? it.stock + delta : null });
    }
    renderPreview();
  }

  function renderPreview(){
    const tbody = $("#previewTable tbody");
    if (!importPreview.length) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:30px">无有效匹配数据</td></tr>`; }
    else {
      tbody.innerHTML = importPreview.map(p => {
        const ok = p.item && p.newStock >= 0;
        return `<tr>
          <td>${p.row}</td>
          <td>${esc(p.name)}</td>
          <td class="num">${p.qty}</td>
          <td class="num">${p.item ? fmtNum(p.item.stock) : "—"}</td>
          <td class="num ${ok ? "" : "gap-neg"}">${p.newStock != null ? fmtNum(p.newStock) : "—"}</td>
          <td>${p.item ? (ok ? `<span class="status ok">匹配</span>` : `<span class="status low">将缺货</span>`) : `<span class="status none">未匹配</span>`}</td>
        </tr>`;
      }).join("");
    }
    $("#previewCard").style.display = "block";
    $("#previewCard").scrollIntoView({ behavior:"smooth" });
  }

  function applyImport(){
    if (!importPreview.length) { toast("没有可应用的更新"); return; }
    let okCount = 0, skipCount = 0;
    importPreview.forEach(p => {
      if (!p.item) { skipCount++; return; }
      if (p.newStock < 0) { skipCount++; return; }
      const before = p.item.stock;
      p.item.stock = p.newStock;
      const memo = $("#mDir").value === "in" ? "Excel 批量入库" : "Excel 批量出库";
      addLog(p.item, $("#mDir").value, p.delta, memo, before, p.newStock);
      okCount++;
    });
    save(); renderAll();
    $("#previewCard").style.display = "none"; importPreview = [];
    toast(`已更新 ${okCount} 项，跳过 ${skipCount} 项`);
  }

  /* ---------- 使用履历 ---------- */
  function bindUsage(){
    $("#uQ").addEventListener("input", e => { uFilter.q = e.target.value.trim(); renderUsage(); });
    $("#uEq").addEventListener("change", e => { uFilter.equipment = e.target.value; renderUsage(); });
    $("#uPart").addEventListener("change", e => { uFilter.part = e.target.value; renderUsage(); });
    $("#btnUsageAdd").addEventListener("click", () => openUsageModal(null));
    $("#btnUsageExport").addEventListener("click", exportUsageExcel);
    $("#btnUsageImport").addEventListener("click", openOcrModal);
    // 表头点击排序：再点一次反转方向
    $("#usageTable thead").addEventListener("click", e => {
      const th = e.target.closest("[data-sort]");
      if (!th) return;
      const field = th.dataset.sort;
      if (uSort.field === field) uSort.dir *= -1;
      else { uSort.field = field; uSort.dir = -1; }
      save();
      renderUsage();
      markSortedHeader();
    });
    $("#usageTable tbody").addEventListener("click", e => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.dataset.act === "edit") openUsageModal(usage.find(u => u.id === btn.dataset.id));
      else if (btn.dataset.act === "del") deleteUsage(btn.dataset.id);
    });
  }

  /* 高亮当前排序列，箭头指向当前方向 */
  function markSortedHeader(){
    $$("#usageTable thead th[data-sort]").forEach(th => {
      const isCur = th.dataset.sort === uSort.field;
      th.classList.toggle("sorted", isCur);
      const label = th.dataset.label || th.textContent.replace(/[ ↕▲▼]/g, "");
      if (th.dataset.label !== label) th.dataset.label = label;
      th.textContent = label + (isCur ? (uSort.dir === -1 ? " ▼" : " ▲") : " ↕");
    });
  }

  /* 把 "9.28"、"7.19" 之类的日期字符串解析为可比较的整数 MMDD */
  function parseUsageDate(s){
    if (!s) return 0;
    const m = String(s).match(/^(\d{1,2})[./-](\d{1,2})$/);
    if (!m) return 0;
    return parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
  }

  function usageCountOf(partName){
    return usage.filter(u => matchPart(partName, u.part)).length;
  }

  /* 物料名与履历备件名模糊匹配：共享英文/数字关键词（TIA/PD/PIC…）或互相包含 */
  function matchPart(a, b){
    if (!a || !b) return false;
    const tok = s => (String(s).toUpperCase().match(/[A-Z0-9]{2,}/g) || []);
    const ta = tok(a), tb = tok(b);
    if (ta.length && tb.length && ta.some(x => tb.includes(x))) return true;
    return a.includes(b) || b.includes(a);
  }

  function renderUsage(){
    const eqs = [...new Set(usage.map(u => u.equipment).filter(Boolean))];
    const parts = [...new Set(usage.map(u => u.part).filter(Boolean))];
    const eqSel = $("#uEq");
    // 合并预设列表和已有设备（去重）
    const allEqs = new Set(EQUIPMENT_LIST.map(e => e.value));
    eqs.forEach(e => allEqs.add(e));
    if (!eqSel.options.length){
      const opts = ["<option value=\"\">全部设备</option>"]
        .concat(EQUIPMENT_LIST.map(e => `<option value="${esc(e.value)}">${esc(e.label)}</option>`))
        .concat([...allEqs].filter(e => !EQUIPMENT_LIST.find(x => x.value === e)).map(e => `<option value="${esc(e)}">${esc(e)}</option>`));
      eqSel.innerHTML = opts.join("");
    }
    const partSel = $("#uPart");
    if (!partSel.options.length){
      partSel.innerHTML = `<option value="">全部备件</option>` + parts.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
    }

    const q = uFilter.q.toLowerCase();
    let rows = usage.filter(u => {
      if (uFilter.equipment && u.equipment !== uFilter.equipment) return false;
      if (uFilter.part && u.part !== uFilter.part) return false;
      if (q && !(u.date + u.equipment + u.model + u.part + (u.reason||"") + (u.preventive||"") + (u.maintTime||"") + (u.handler||"") + (u.other||"") + (u.note||"")).toLowerCase().includes(q)) return false;
      return true;
    });
    rows.sort((a,b) => {
      const va = a[uSort.field] || "";
      const vb = b[uSort.field] || "";
      let cmp;
      if (uSort.field === "date" || uSort.field === "maintTime") {
        cmp = parseUsageDate(va) - parseUsageDate(vb);
      } else {
        cmp = String(va).localeCompare(String(vb), "zh");
      }
      return cmp * uSort.dir;
    });

    const tbody = $("#usageTable tbody");
    if (!rows.length){
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:40px">暂无使用履历（可点右上角「新增记录」或「看图转化导入」）</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((u, idx) => `<tr>
      <td><b>${esc(u.date)}</b></td>
      <td>${esc(u.equipment)}</td>
      <td>${esc(u.model || "—")}</td>
      <td><b>${esc(u.part)}</b></td>
      <td style="max-width:180px">${esc(u.reason || "")}${u.note ? `<div class="muted ocr-note">※ ${esc(u.note)}</div>` : ""}</td>
      <td style="max-width:120px;color:var(--muted)">${esc(u.preventive || "—")}</td>
      <td>${esc(u.maintTime || "—")}</td>
      <td>${esc(u.handler || "—")}</td>
      <td style="max-width:120px;color:var(--muted)">${esc(u.other || "—")}</td>
      <td>
        <button class="btn sm ghost" data-act="edit" data-id="${u.id}">编辑</button>
        <button class="btn sm ghost" data-act="del" data-id="${u.id}">删除</button>
      </td>
    </tr>`).join("");
    markSortedHeader();
  }

  function openUsageModal(u){
    editUsage = u || null;
    $("#usageModalTitle").textContent = u ? "编辑使用记录" : "新增使用记录";
    $("#uDate").value = u ? u.date : new Date().toLocaleDateString("zh-CN", { month:"numeric", day:"numeric" });
    $("#uEquipment").value = u ? (u.equipment||"") : "DB 3#";
    $("#uModel").value = u ? (u.model||"") : "DA403.D";
    $("#uPart").value = u ? (u.part||"") : "";
    $("#uReason").value = u ? (u.reason||"") : "";
    $("#uPreventive").value = u ? (u.preventive||"") : "";
    $("#uMaintTime").value = u ? (u.maintTime||"") : "";
    $("#uHandler").value = u ? (u.handler||"") : "";
    $("#uOther").value = u ? (u.other||"") : "";
    $("#usageModal").classList.add("show");
  }

  function saveUsageFromModal(){
    const part = $("#uPart").value.trim();
    const date = $("#uDate").value.trim();
    if (!part) { toast("备件名称必填"); return; }
    if (!date) { toast("日期必填"); return; }
    const obj = {
      date, equipment: $("#uEquipment").value.trim() || "—",
      model: $("#uModel").value.trim() || "",
      part, reason: $("#uReason").value.trim(),
      preventive: $("#uPreventive").value.trim(),
      maintTime: $("#uMaintTime").value.trim(),
      handler: $("#uHandler").value.trim(),
      other: $("#uOther").value.trim()
    };
    if (editUsage){
      Object.assign(editUsage, obj);
      toast("已更新记录");
    } else {
      obj.id = "U" + Date.now().toString().slice(-5) + Math.floor(Math.random()*10);
      usage.push(obj);
      toast("已新增使用记录");
    }
    closeModals(); save(); renderAll();
  }

  function deleteUsage(id){
    const u = usage.find(x => x.id === id);
    if (!u || !confirm(`确定删除 ${u.date}「${u.part}」这条履历？`)) return;
    usage = usage.filter(x => x.id !== id);
    save(); renderAll(); toast("已删除");
  }

  function exportUsageExcel(){
    const rows = [["日期","设备名称","设备型号","备件名称","更换原因","预防措施","维修时间","接单人","其他建议","备注"]];
    usage.forEach(u => rows.push([u.date, u.equipment, u.model, u.part, u.reason, u.preventive, u.maintTime, u.handler, u.other, u.note || ""]));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "使用履历");
    XLSX.writeFile(wb, `备件使用履历_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast("已导出 Excel");
  }

  /* ---------- 看图转化导入（OCR 转写数据） ---------- */
  let ocrImageData = null;

  function openOcrModal(){
    $("#ocrPaste").value = "";
    ocrPreview = [];
    $("#ocrResultBox").style.display = "none";
    $("#ocrHint").style.display = "none";
    $("#ocrImageArea").style.display = "";
    $("#ocrImagePreview").style.display = "none";
    $("#btnOcrRecognize").style.display = "none";
    $("#btnOcrClearImg").style.display = "";
    $("#ocrDropHint").style.display = "";
    $("#ocrJsonArea").style.display = "";
    $("#ocrModal").classList.add("show");
  }

  function showOcrImage(file){
    const reader = new FileReader();
    reader.onload = e => {
      ocrImageData = e.target.result;
      const img = $("#ocrImagePreview");
      img.src = ocrImageData;
      img.style.display = "block";
      $("#ocrDropHint").style.display = "none";
      $("#btnOcrRecognize").style.display = "";
      $("#ocrHint").style.display = "none";
    };
    reader.readAsDataURL(file);
  }

  // 点「识别图片」→ 自动复制到剪贴板 → 提示切到对话框粘贴给我
  function recognizeOcrImage(){
    if (!ocrImageData) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(
          () => {
            $("#ocrHint").style.display = "block";
            toast("✅ 图片已复制！切到 WorkBuddy 对话框按 Ctrl+V 粘贴，我会识别后给你 JSON");
          },
          () => {
            // fallback: tell user to right-click and copy
            $("#ocrHint").style.display = "block";
            $("#ocrHint").innerHTML = "⚠️ 自动复制失败，请<strong>右键下方图片</strong>→「复制图片」，然后切到 WorkBuddy 对话框粘贴给我。";
            toast("请右键图片手动复制");
          }
        );
      }, "image/png");
    };
    img.src = ocrImageData;
  }

  function clearOcrImage(){
    ocrImageData = null;
    $("#ocrImagePreview").style.display = "none";
    $("#ocrDropHint").style.display = "";
    $("#btnOcrRecognize").style.display = "none";
    $("#ocrHint").style.display = "none";
  }

  function parseOcrInput(text){
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) throw new Error("未找到 JSON 数组");
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) throw new Error("JSON 不是数组");
    return arr.map(o => ({
      date: String(o.date || "").trim(),
      equipment: String(o.equipment || o.eq || "").trim(),
      model: String(o.model || "").trim(),
      part: String(o.part || o.name || "").trim(),
      reason: String(o.reason || "").trim(),
      preventive: String(o.preventive || "").trim(),
      maintTime: String(o.maintTime || o.maint_time || "").trim(),
      handler: String(o.handler || "").trim(),
      other: String(o.other || "").trim(),
      note: String(o.note || o._note || "")
    })).filter(o => o.date || o.part);
  }

  function previewOcr(){
    const text = $("#ocrPaste").value.trim();
    if (!text) { toast("请粘贴 AI 返回的 JSON 数据"); return; }
    let parsed;
    try { parsed = parseOcrInput(text); }
    catch(e){ toast("解析失败：" + e.message); return; }
    ocrPreview = parsed.map((o, i) => ({ ...o, ok: !!(o.date && o.part) }));
    $("#ocrJsonArea").style.display = "none";
    renderOcrPreview();
  }

  function renderOcrPreview(){
    const box = $("#ocrResultBox");
    if (!ocrPreview.length){ box.style.display = "none"; return; }
    $("#ocrResultCount").textContent = `共 ${ocrPreview.length} 条（可编辑后导入）`;
    box.style.display = "block";
    renderOcrTable();
  }

  function renderOcrTable(){
    const tbody = $("#ocrResultTable tbody");
    tbody.innerHTML = ocrPreview.map((o, i) => `<tr>
      <td><input type="text" value="${esc(o.date)}" data-i="${i}" data-f="date" class="ocr-edit" style="width:60px"></td>
      <td><input type="text" value="${esc(o.equipment)}" data-i="${i}" data-f="equipment" class="ocr-edit" style="width:70px"></td>
      <td><input type="text" value="${esc(o.model)}" data-i="${i}" data-f="model" class="ocr-edit" style="width:80px"></td>
      <td><input type="text" value="${esc(o.part)}" data-i="${i}" data-f="part" class="ocr-edit" style="width:120px"></td>
      <td><input type="text" value="${esc(o.reason)}" data-i="${i}" data-f="reason" class="ocr-edit" style="width:150px"></td>
      <td><input type="text" value="${esc(o.preventive)}" data-i="${i}" data-f="preventive" class="ocr-edit" style="width:120px"></td>
      <td><input type="text" value="${esc(o.maintTime)}" data-i="${i}" data-f="maintTime" class="ocr-edit" style="width:60px"></td>
      <td><input type="text" value="${esc(o.handler)}" data-i="${i}" data-f="handler" class="ocr-edit" style="width:70px"></td>
      <td><input type="text" value="${esc(o.other)}" data-i="${i}" data-f="other" class="ocr-edit" style="width:100px"></td>
      <td><button class="btn ghost ocr-del" data-i="${i}" title="删除">✕</button></td>
    </tr>`).join("");
    tbody.querySelectorAll(".ocr-del").forEach(btn => {
      btn.addEventListener("click", () => {
        ocrPreview.splice(+btn.dataset.i, 1);
        renderOcrTable();
      });
    });
    tbody.querySelectorAll(".ocr-edit").forEach(inp => {
      inp.addEventListener("input", e => {
        const i = +e.target.dataset.i, f = e.target.dataset.f;
        ocrPreview[i][f] = e.target.value.trim();
        ocrPreview[i].ok = !!(ocrPreview[i].date && ocrPreview[i].part);
      });
    });
    $("#ocrResultCount").textContent = `共 ${ocrPreview.length} 条（有效 ${ocrPreview.filter(o=>o.ok).length}）`;
  }

  function applyOcr(){
    const rows = ocrPreview.filter(o => o.ok);
    if (!rows.length) { toast("没有可导入的有效记录"); return; }
    const now = Date.now();
    rows.forEach((o, i) => {
      o.id = "U" + (now + i).toString(36);
      usage.push(o);
    });
    save(); closeModals(); renderAll();
    toast(`已导入 ${rows.length} 条使用履历`);
    $("#ocrResultBox").style.display = "none"; ocrPreview = [];
  }

  /* ---------- Log ---------- */
  function bindLog(){
    $("#btnClearLog").addEventListener("click", () => { if (confirm("清空所有流水记录？")) { logs = []; save(); renderLog(); } });
  }

  function renderLog(){
    const el = $("#timeline");
    if (!logs.length) { el.innerHTML = `<div class="card" style="text-align:center;color:var(--muted);padding:50px">暂无流水记录</div>`; return; }
    el.innerHTML = logs.map(l => {
      const typeClass = l.type === "in" ? "in" : l.type === "out" ? "out" : "edit";
      const typeLabel = l.type === "in" ? "入库" : l.type === "out" ? "出库" : l.type === "add" ? "新增" : "修改";
      return `<div class="log-item">
        <div class="log-time">${esc(l.time)}</div>
        <span class="log-badge ${typeClass}">${typeLabel}</span>
        <div class="log-body">
          <b>${esc(l.name)}</b> · ${esc(l.process)} / ${esc(l.equipment)}
          ${l.delta !== 0 ? `<span style="margin-left:8px;font-weight:700;color:${l.delta>0?"var(--ok)":l.delta<0?"var(--danger)":"var(--text2)"}">${l.delta>0?"+":""}${l.delta}</span>` : ""}
          <div class="muted" style="margin-top:2px">${esc(l.memo)} ${l.before != null ? `（${fmtNum(l.before)} → ${fmtNum(l.after)}）` : ""}</div>
        </div>
      </div>`;
    }).join("");
  }

  /* ---------- Stats & Render All ---------- */
  function renderStats(){
    const total = items.length;
    const lowCount = items.filter(i => statusOf(i).key === "low").length;
    const autoCount = items.filter(i => i.safetyAuto).length;
    const totalStock = items.reduce((a,b) => a + b.stock, 0);
    const procs = new Set(items.map(i => i.process)).size;
    $("#stTotal").textContent = total;
    $("#stLow").textContent = lowCount;
    $("#stAuto").textContent = autoCount;
    $("#stStock").textContent = totalStock;
    $("#stProc").textContent = procs;
    $("#connCount").textContent = total;
  }

  function renderAll(){
    renderStats();
    renderDashboard();
    renderLedger();
    renderUsage();
    renderLog();
  }

  function toast(msg){
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2500);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
