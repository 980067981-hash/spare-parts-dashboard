/* ============ 设备备件耗材管理系统 ============ */
(function () {
  "use strict";
  const STORE_KEY = "spare_parts_v3";
  const LS = window.localStorage;

  /* ---------- 状态 ---------- */
  let items = [];      // 库存台账
  let log = [];        // 变动流水
  let view = "dashboard";
  let filter = { q: "", process: "", onlyLow: false };

  function load() {
    try {
      const raw = LS.getItem(STORE_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        items = o.items || [];
        log = o.log || [];
        return;
      }
    } catch (e) {}
    items = JSON.parse(JSON.stringify(SEED_ITEMS));
    log = [];
    save();
  }
  function save() {
    LS.setItem(STORE_KEY, JSON.stringify({ items, log }));
  }

  /* ---------- 工具 ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.add("hidden"), 2200);
  }
  function fmtNum(n) { return (n == null ? 0 : n); }

  // 状态判定：与安全带比较（未设安全库存时显示中性"未设标准"）
  function statusOf(it) {
    if (!it.safety || it.safety <= 0) return { key: "none", label: "未设标准", gap: null };
    const gap = it.stock - it.safety;
    if (gap < 0) return { key: "low", label: "低于安全库存", gap };
    if (gap === 0) return { key: "warn", label: "触及安全线", gap };
    if (gap <= Math.max(1, Math.ceil(it.safety * 0.2))) return { key: "warn", label: "偏低预警", gap };
    return { key: "ok", label: "充足", gap };
  }

  /* ---------- 弹窗 ---------- */
  function openModal(html) {
    $("#modalBox").innerHTML = html;
    $("#modalRoot").classList.remove("hidden");
  }
  function closeModal() { $("#modalRoot").classList.add("hidden"); $("#modalBox").innerHTML = ""; }
  $("#modalRoot").addEventListener("click", e => { if (e.target.dataset.close !== undefined) closeModal(); });

  /* ---------- 渲染：看板 ---------- */
  function renderDashboard() {
    const procs = [...new Set(items.map(i => i.process))];
    let total = items.length, lowCount = 0, autoCount = 0, totalStock = 0;
    items.forEach(i => { totalStock += i.stock; const s = statusOf(i); if (s.key === "low") lowCount++; if (i.safetyAuto) autoCount++; });

    let h = `<div class="summary">
      <div class="scard"><div class="k">工序数</div><div class="v">${procs.length}<small> 个</small></div></div>
      <div class="scard"><div class="k">物料条目</div><div class="v">${total}<small> 项</small></div></div>
      <div class="scard alert"><div class="k">低于安全库存</div><div class="v">${lowCount}<small> 项</small></div></div>
      <div class="scard"><div class="k">安全线待校准<span style="color:var(--warn)">●</span></div><div class="v">${autoCount}<small> 项</small></div></div>
    </div>`;

    h += `<div class="toolbar">
      <input id="fQ" placeholder="🔍 搜索物料 / 设备…" value="${esc(filter.q)}">
      <select id="fProc"><option value="">全部工序</option>${procs.map(p => `<option ${filter.process === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)"><input type="checkbox" id="fLow" ${filter.onlyLow ? "checked" : ""}> 仅看低于安全库存</label>
      <span style="font-size:12px;color:var(--muted)">图例：<span class="safety-auto">橙色安全线</span> = 系统默认占位(5)，待你校准</span>
    </div>`;

    procs.filter(p => !filter.process || p === filter.process).forEach(proc => {
      let rows = items.filter(i => i.process === proc);
      if (filter.q) {
        const q = filter.q.toLowerCase();
        rows = rows.filter(i => (i.name + i.equipment + i.note).toLowerCase().includes(q));
      }
      if (filter.onlyLow) rows = rows.filter(i => statusOf(i).key === "low");
      if (!rows.length) return;

      const low = rows.filter(i => statusOf(i).key === "low").length;
      const eqs = [...new Set(rows.map(i => i.equipment))].join(" / ");
      h += `<section class="proc">
        <div class="proc-head">
          <span class="pt">${esc(proc)}</span>
          <span class="badge ${low ? "low" : ""}">${rows.length} 项${low ? " · 缺货 " + low : ""}</span>
          <span class="eq">${esc(eqs)}</span>
        </div>
        <table>
          <thead><tr>
            <th>物料名称</th><th>设备/机台</th><th class="num">当前库存</th>
            <th class="num">安全库存</th><th class="num">差值</th><th>状态</th><th>备注</th>
          </tr></thead><tbody>`;
      rows.sort((a, b) => (statusOf(a).gap == null ? 1e9 : statusOf(a).gap) - (statusOf(b).gap == null ? 1e9 : statusOf(b).gap)).forEach(it => {
        const s = statusOf(it);
        const gapTxt = s.gap == null ? `<span style="color:var(--muted)">—</span>` : (s.gap < 0 ? `<span class="gap-neg">${s.gap}</span>` : `<span class="gap-pos">+${s.gap}</span>`);
        h += `<tr class="${s.key === "low" ? "rowlow" : ""}">
          <td><b>${esc(it.name)}</b></td>
          <td><span class="tag">${esc(it.equipment)}</span></td>
          <td class="num">${fmtNum(it.stock)}<small style="color:var(--muted)"> ${esc(it.unit)}</small></td>
          <td class="num">${it.safetyAuto ? `<span class="safety-auto" title="系统默认占位(5)，点击台账可改为真实标准">${fmtNum(it.safety)}</span>` : fmtNum(it.safety)}</td>
          <td class="num">${gapTxt}</td>
          <td><span class="status ${s.key}">${s.label}</span></td>
          <td style="color:var(--muted)">${esc(it.note)}</td>
        </tr>`;
      });
      h += `</tbody></table></section>`;
    });

    if (!procs.length || !items.length) h += `<div class="empty">暂无数据，请到「库存台账」添加或在「链接使用表」导入。</div>`;
    $("#main").innerHTML = h;

    $("#fQ").oninput = e => { filter.q = e.target.value; renderDashboard(); };
    $("#fProc").onchange = e => { filter.process = e.target.value; renderDashboard(); };
    $("#fLow").onchange = e => { filter.onlyLow = e.target.checked; renderDashboard(); };
  }

  /* ---------- 渲染：台账 ---------- */
  function renderLedger() {
    let h = `<div class="toolbar">
      <input id="lQ" placeholder="🔍 搜索物料 / 设备 / 备注…" value="${esc(filter.q)}">
      <button class="btn primary" id="btnAdd">＋ 新增物料</button>
      <button class="btn" id="btnBatch">🔧 批量校准安全线</button>
      <span class="spacer"></span>
      <span style="font-size:12px;color:var(--muted)">提示：库存 / 安全库存 单元格可直接双击修改</span>
    </div>`;
    h += `<section class="proc"><table>
      <thead><tr>
        <th>工序</th><th>设备/机台</th><th>物料名称</th><th>单位</th>
        <th class="num">当前库存</th><th class="num">安全库存</th><th>备注</th><th style="text-align:right">操作</th>
      </tr></thead><tbody>`;
    let rows = items.slice();
    if (filter.q) {
      const q = filter.q.toLowerCase();
      rows = rows.filter(i => (i.name + i.equipment + i.note + i.process).toLowerCase().includes(q));
    }
    rows.forEach(it => {
      h += `<tr>
        <td>${esc(it.process)}</td>
        <td><span class="tag">${esc(it.equipment)}</span></td>
        <td><b>${esc(it.name)}</b></td>
        <td>${esc(it.unit)}</td>
        <td class="num editable" data-edit="stock" data-id="${it.id}" title="双击修改">${fmtNum(it.stock)}</td>
        <td class="num editable" data-edit="safety" data-id="${it.id}" title="双击修改">${it.safetyAuto ? `<span class="safety-auto">${fmtNum(it.safety)}</span>` : fmtNum(it.safety)}</td>
        <td style="color:var(--muted)">${esc(it.note)}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn sm" data-act="in" data-id="${it.id}">入库</button>
          <button class="btn sm" data-act="out" data-id="${it.id}">出库</button>
          <button class="btn sm" data-act="edit" data-id="${it.id}">编辑</button>
          <button class="btn sm danger" data-act="del" data-id="${it.id}">删</button>
        </td>
      </tr>`;
    });
    h += `</tbody></table></section>`;
    $("#main").innerHTML = h;

    $("#lQ").oninput = e => { filter.q = e.target.value; renderLedger(); };
    $("#btnAdd").onclick = () => openItemModal(null);
    $("#btnBatch").onclick = openBatchModal;

    $$("[data-act]").forEach(b => b.onclick = () => {
      const it = items.find(x => x.id === b.dataset.id);
      if (!it) return;
      const a = b.dataset.act;
      if (a === "in") openAdjModal(it, "in");
      else if (a === "out") openAdjModal(it, "out");
      else if (a === "edit") openItemModal(it);
      else if (a === "del") {
        if (confirm(`确认删除物料「${it.name}」？`)) {
          items = items.filter(x => x.id !== it.id); save(); renderLedger(); toast("已删除");
        }
      }
    });

    $$("[data-edit]").forEach(c => c.ondblclick = () => {
      const it = items.find(x => x.id === c.dataset.id);
      const field = c.dataset.edit;
      const v = prompt(`修改 ${field === "stock" ? "当前库存" : "安全库存"}（${it.name}）`, it[field]);
      if (v === null) return;
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 0) { toast("请输入非负整数"); return; }
      const before = it[field];
      it[field] = n;
      if (field === "safety") it.safetyAuto = false;
      save();
      if (field === "stock") addLog(it, "edit", n - before, `直接修改库存为${n}`, before, n);
      renderLedger();
    });
  }

  /* ---------- 入库 / 出库 弹窗 ---------- */
  function openAdjModal(it, type) {
    const title = type === "in" ? "入库（增加库存）" : "出库 / 领用（减少库存）";
    openModal(`<h3>${esc(title)}</h3>
      <div style="margin-bottom:12px;color:var(--muted);font-size:13px">
        物料：<b style="color:var(--ink)">${esc(it.name)}</b> ｜ 当前库存：<b>${fmtNum(it.stock)}</b> ${esc(it.unit)}</div>
      <div class="field"><label>数量（${type === "out" ? "将扣减" : "将增加"}）</label>
        <input id="mQty" type="number" min="1" value="1"></div>
      <div class="field"><label>说明 / 单号（可选）</label>
        <input id="mNote" placeholder="如 领用单号、采购单号"></div>
      <div class="modal-actions">
        <button class="btn ghost" data-close>取消</button>
        <button class="btn primary" id="mOk">确定</button>
      </div>`);
    $("#mOk").onclick = () => {
      const q = parseInt($("#mQty").value, 10);
      if (isNaN(q) || q <= 0) { toast("请输入正整数数量"); return; }
      const before = it.stock;
      if (type === "out") {
        if (q > it.stock) { toast("出库数量超过当前库存"); return; }
        it.stock -= q;
      } else it.stock += q;
      addLog(it, type, type === "in" ? q : -q, $("#mNote").value, before, it.stock);
      save(); closeModal();
      view === "ledger" ? renderLedger() : renderDashboard();
      toast(type === "in" ? `已入库 ${q}` : `已出库 ${q}`);
    };
  }

  /* ---------- 新增 / 编辑 物料 ---------- */
  function openItemModal(it) {
    const isEdit = !!it;
    const procs = [...new Set(items.map(i => i.process))];
    openModal(`<h3>${isEdit ? "编辑物料" : "新增物料"}</h3>
      <div class="grid2">
        <div class="field"><label>工序 / 分类</label>
          <input id="iProc" list="procList" value="${esc(isEdit ? it.process : "")}" placeholder="如 焊线工序(DBWB)">
          <datalist id="procList">${procs.map(p => `<option value="${esc(p)}">`).join("")}</datalist></div>
        <div class="field"><label>设备 / 机台</label>
          <input id="iEq" value="${esc(isEdit ? it.equipment : "")}"></div>
      </div>
      <div class="field"><label>物料名称</label><input id="iName" value="${esc(isEdit ? it.name : "")}"></div>
      <div class="grid2">
        <div class="field"><label>单位</label><input id="iUnit" value="${esc(isEdit ? it.unit : "个")}"></div>
        <div class="field"><label>当前库存</label><input id="iStock" type="number" min="0" value="${isEdit ? it.stock : 0}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label>安全库存标准</label><input id="iSafety" type="number" min="0" value="${isEdit ? it.safety : 0}">
          <div class="hint">低于该值将在看板标红预警</div></div>
        <div class="field"><label>备注</label><input id="iNote" value="${esc(isEdit ? it.note : "")}"></div>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" data-close>取消</button>
        <button class="btn primary" id="mOk">${isEdit ? "保存" : "新增"}</button>
      </div>`);
    $("#mOk").onclick = () => {
      const name = $("#iName").value.trim();
      if (!name) { toast("请填写物料名称"); return; }
      const obj = {
        process: $("#iProc").value.trim() || "未分类",
        equipment: $("#iEq").value.trim() || "—",
        name, unit: $("#iUnit").value.trim() || "个",
        stock: parseInt($("#iStock").value, 10) || 0,
        safety: parseInt($("#iSafety").value, 10) || 0,
        safetyAuto: false,
        note: $("#iNote").value.trim()
      };
      if (isEdit) { Object.assign(it, obj); }
      else { obj.id = "P" + Date.now().toString().slice(-7); items.push(obj); addLog(obj, "add", obj.stock, "新增物料"); }
      save(); closeModal(); renderLedger(); toast(isEdit ? "已保存" : "已新增");
    };
  }

  /* ---------- 批量校准安全线 ---------- */
  function openBatchModal() {
    const procs = [...new Set(items.map(i => i.process))];
    openModal(`<h3>批量校准安全库存</h3>
      <p style="color:var(--muted);font-size:13px;margin:0 0 12px">给所选工序的全部物料统一设定安全库存线，并标记为「手动设定」（不再显示橙色默认占位）。</p>
      <div class="field"><label>工序 / 分类</label>
        <select id="bProc"><option value="">全部工序</option>${procs.map(p => `<option>${esc(p)}</option>`).join("")}</select></div>
      <div class="field"><label>安全库存值</label>
        <input id="bVal" type="number" min="0" value="5">
        <div class="hint">将写入所选范围内的每一项（覆盖原值）</div></div>
      <div class="modal-actions">
        <button class="btn ghost" data-close>取消</button>
        <button class="btn primary" id="bOk">应用</button>
      </div>`);
    $("#bOk").onclick = () => {
      const p = $("#bProc").value, v = parseInt($("#bVal").value, 10);
      if (isNaN(v) || v < 0) { toast("请输入非负整数"); return; }
      let n = 0;
      items.forEach(it => { if (!p || it.process === p) { it.safety = v; it.safetyAuto = false; n++; } });
      save(); closeModal(); renderLedger(); toast(`已校准 ${n} 项`);
    };
  }

  /* ---------- 流水 ---------- */
  function addLog(it, type, delta, note, before, after) {
    log.unshift({
      time: new Date().toLocaleString("zh-CN"),
      name: it.name, type, delta, note: note || "",
      before: before != null ? before : (it.stock - (delta || 0)),
      after: after != null ? after : it.stock
    });
    if (log.length > 500) log.length = 500;
  }
  function renderLog() {
    let h = `<div class="toolbar"><span style="font-size:13px;color:var(--muted)">共 ${log.length} 条变动记录（最近 500 条）</span>
      <span class="spacer"></span>
      <button class="btn ghost" id="btnClearLog">清空流水</button></div>`;
    if (!log.length) { h += `<div class="empty">暂无变动记录</div>`; $("#main").innerHTML = h; return; }
    h += `<section class="proc"><table>
      <thead><tr><th>时间</th><th>物料</th><th>类型</th><th class="num">变动</th><th class="num">变动前</th><th class="num">变动后</th><th>说明</th></tr></thead><tbody>`;
    const map = { in: ["入库", "ok"], out: ["出库", "low"], add: ["新增", ""], edit: ["调整", ""], import: ["导入", ""] };
    log.forEach(r => {
      const m = map[r.type] || [r.type, ""];
      const d = r.delta > 0 ? `<span style="color:var(--ok);font-weight:700">+${r.delta}</span>` : `<span style="color:var(--danger);font-weight:700">${r.delta}</span>`;
      h += `<tr><td style="color:var(--muted)">${esc(r.time)}</td><td><b>${esc(r.name)}</b></td>
        <td><span class="status ${m[1] || "ok"}">${m[0]}</span></td>
        <td class="num">${d}</td><td class="num">${fmtNum(r.before)}</td><td class="num">${fmtNum(r.after)}</td>
        <td style="color:var(--muted)">${esc(r.note)}</td></tr>`;
    });
    h += `</tbody></table></section>`;
    $("#main").innerHTML = h;
    $("#btnClearLog").onclick = () => { if (confirm("确认清空全部变动流水？")) { log = []; save(); renderLog(); toast("已清空"); } };
  }

  /* ---------- 导入使用表 ---------- */
  let importState = null;
  function renderImport() {
    $("#main").innerHTML = `<div class="toolbar"><span style="font-size:13px;color:var(--muted)">
      上传一份「耗材使用 / 领用表」Excel，按列匹配物料名称与数量，系统自动按名称更新库存。</span></div>
      <div class="import-zone" id="drop">
        <div style="font-size:34px">📥</div>
        <p><b>点击选择</b> 或 拖拽 Excel 文件到此</p>
        <p style="font-size:12px">支持 .xlsx / .xls ｜ 第一行为表头</p>
        <input type="file" id="file" accept=".xlsx,.xls" class="hidden">
      </div>
      <div id="importBody"></div>`;
    const dz = $("#drop"), fi = $("#file");
    dz.onclick = () => fi.click();
    fi.onchange = () => { if (fi.files[0]) readExcel(fi.files[0]); };
    ["dragover", "dragenter"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("drag"); }));
    ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("drag"); }));
    dz.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) readExcel(f); });
  }

  function readExcel(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }).filter(r => r.some(c => c !== "" && c != null));
        if (rows.length < 2) { toast("表格内容不足"); return; }
        importState = { rows, headers: rows[0].map((h, i) => ({ h: String(h), i })), preview: null, matched: [] };
        renderImportMap();
      } catch (err) { toast("读取失败：" + err.message); }
    };
    reader.readAsArrayBuffer(file);
  }

  function renderImportMap() {
    const st = importState;
    const headers = st.headers;
    const nameOpts = `<option value="">— 选择列 —</option>` + headers.map(h => `<option value="${h.i}">${esc(h.h || "(空)")}</option>`).join("");
    let h = `<section class="proc"><div style="padding:14px 16px">
      <h3 style="margin:0 0 4px">① 列匹配</h3>
      <p style="color:var(--muted);font-size:13px;margin:0 0 10px">文件：<b>${headers.length}</b> 列，<b>${st.rows.length - 1}</b> 行数据。请指定「物料名称」「数量」所在列。</p>
      <table class="map-table"><tr>
        <td style="width:33%"><div class="field" style="margin:0"><label>物料名称列</label><select id="cName">${nameOpts}</select></div></td>
        <td style="width:33%"><div class="field" style="margin:0"><label>数量列</label><select id="cQty">${nameOpts}</select></div></td>
        <td style="width:33%"><div class="field" style="margin:0"><label>增减方向</label>
          <select id="cDir">
            <option value="sign">按数量符号（正=入库，负=出库）</option>
            <option value="allin">全部作为入库(+)</option>
            <option value="allout">全部作为出库(-)</option>
          </select></div></td>
      </tr></table>
      <div class="modal-actions" style="justify-content:flex-start">
        <button class="btn primary" id="btnPreview">② 预览匹配结果</button>
        <button class="btn ghost" id="btnCancel">取消</button>
      </div>
    </div></section>
    <div id="pv"></div>`;
    $("#importBody").innerHTML = h;
    $("#btnCancel").onclick = () => { importState = null; renderImport(); };
    $("#btnPreview").onclick = previewImport;
    // 预选：尝试按表头猜测
    const guess = (kw) => headers.findIndex(h => kw.some(k => (h.h || "").includes(k)));
    const gn = guess(["名称", "配件", "物料", "item", "name"]);
    const gq = guess(["数量", "qty", "num", "领用", "使用"]);
    if (gn >= 0) $("#cName").value = gn;
    if (gq >= 0) $("#cQty").value = gq;
  }

  function previewImport() {
    const st = importState;
    const ni = parseInt($("#cName").value, 10);
    const qi = parseInt($("#cQty").value, 10);
    const dir = $("#cDir").value;
    if (isNaN(ni) || isNaN(qi)) { toast("请先选择名称列和数量列"); return; }

    const matched = []; let unmatched = 0;
    for (let r = 1; r < st.rows.length; r++) {
      const row = st.rows[r];
      const nm = String(row[ni] || "").trim();
      let q = parseFloat(row[qi]);
      if (!nm || isNaN(q)) continue;
      let delta = q;
      if (dir === "allin") delta = Math.abs(q);
      else if (dir === "allout") delta = -Math.abs(q);
      else delta = q; // sign
      const it = items.find(i => i.name === nm || i.name.toLowerCase() === nm.toLowerCase());
      if (it) matched.push({ name: nm, item: it, delta: Math.round(delta), before: it.stock });
      else unmatched++;
    }
    st.matched = matched; st.unmatched = unmatched;
    let h = `<section class="proc"><div style="padding:14px 16px">
      <h3 style="margin:0 0 4px">③ 预览（匹配 ${matched.length} 项，未匹配 ${unmatched} 项）</h3>
      <p style="color:var(--muted);font-size:13px;margin:0 0 10px">入库为正、出库为负。确认后将直接更新库存并写入流水。</p>
      <div class="preview-box"><table>
        <thead><tr><th>物料名称</th><th class="num">变动</th><th class="num">当前库存</th><th class="num">更新后</th><th>状态</th></tr></thead><tbody>`;
    matched.forEach(m => {
      const after = m.before + m.delta;
      const d = m.delta > 0 ? `<span style="color:var(--ok);font-weight:700">+${m.delta}</span>` : `<span style="color:var(--danger);font-weight:700">${m.delta}</span>`;
      h += `<tr><td><b>${esc(m.name)}</b></td><td class="num">${d}</td><td class="num">${m.before}</td>
        <td class="num">${after}</td><td>${after < 0 ? '<span class="status low">将为负</span>' : '<span class="status ok">正常</span>'}</td></tr>`;
    });
    if (!matched.length) h += `<tr><td colspan="5" style="color:var(--muted)">无匹配项，请检查名称列或物料是否在台账中。</td></tr>`;
    h += `</tbody></table></div>
      <div class="modal-actions" style="justify-content:flex-end;margin-top:14px">
        <button class="btn ghost" id="btnBack">返回重选</button>
        <button class="btn primary" id="btnApply" ${matched.length ? "" : "disabled"}>④ 确认应用并更新库存</button>
      </div></div></section>`;
    $("#pv").innerHTML = h;
    $("#btnBack").onclick = renderImportMap;
    $("#btnApply").onclick = applyImport;
  }

  function applyImport() {
    const st = importState;
    let applied = 0;
    st.matched.forEach(m => {
      if (m.before + m.delta < 0) { toast(`「${m.name}」应用后库存为负，已跳过`); return; }
      const before = m.item.stock;
      m.item.stock += m.delta;
      addLog(m.item, "import", m.delta, "链接使用表导入", before, m.item.stock);
      applied++;
    });
    save(); importState = null;
    toast(`已应用 ${applied} 项变动`);
    view = "dashboard"; switchView("dashboard");
  }

  /* ---------- 导出 ---------- */
  function exportExcel() {
    const rows = [["工序", "设备/机台", "物料名称", "单位", "当前库存", "安全库存", "安全线来源", "差值", "状态", "备注"]];
    items.forEach(it => {
      const s = statusOf(it);
      rows.push([it.process, it.equipment, it.name, it.unit, it.stock, it.safety, it.safetyAuto ? "默认(5)" : "手动设定", s.gap == null ? "—" : s.gap, s.label, it.note]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "备件库存");
    XLSX.writeFile(wb, `备件耗材台账_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast("已导出 Excel");
  }

  /* ---------- 视图切换 ---------- */
  function switchView(v) {
    view = v;
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === v));
    if (v === "dashboard") renderDashboard();
    else if (v === "ledger") renderLedger();
    else if (v === "import") renderImport();
    else if (v === "log") renderLog();
  }

  /* ---------- 绑定 ---------- */
  $("#tabs").addEventListener("click", e => { const t = e.target.closest(".tab"); if (t) switchView(t.dataset.view); });
  $("#btnExport").onclick = exportExcel;
  $("#btnReset").onclick = () => {
    if (confirm("将清空当前所有改动并恢复为初始种子数据，确定？")) {
      items = JSON.parse(JSON.stringify(SEED_ITEMS)); log = []; save(); switchView(view); toast("已重置");
    }
  };

  /* ---------- 启动 ---------- */
  load();
  switchView("dashboard");
})();
