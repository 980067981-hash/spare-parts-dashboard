import json

with open("C:/Users/admin/WorkBuddy/2026-09-17-11-26-50/seed_data.json", encoding="utf-8") as f:
    data = json.load(f)

def default_safety(name, stock):
    """按物料类别给出建议安全库存线（需结合实际修订）"""
    n = name
    if "吸嘴" in n or "点胶头" in n:
        return 5           # 高频易耗，留缓冲
    if "顶针" in n:
        return 5
    if stock >= 40:
        return max(10, round(stock * 0.3))   # 大批量标准件按 30%
    # 板卡类
    if any(k in n for k in ["加电板", "抬板", "固定块", "安装块", "连接架", "支架", "调节片", "限位", "块", "架"]):
        return 4
    # 其余机械 / 标准备件：建议常备 3
    return 3

items = []
i = 1
for grp in (data["dbwb"], data["coupling"]):
    for r in grp:
        stock = r["stock"]
        items.append({
            "id": f"P{i:04d}",
            "process": r["process"],
            "equipment": r["equipment"],
            "name": r["name"],
            "unit": "个",
            "stock": stock,
            "safety": 5,
            "safetyAuto": True,
            "note": r.get("note", "")
        })
        i += 1

js = "// 初始种子数据：由 DBWB耗材盘点.xlsx(9月) 与 耦合段配件统计.xlsx 提取生成\n"
js += "// safety 默认 5 为系统占位值(safetyAuto=true)，手动设定的项 safetyAuto=false\n"
js += "const SEED_ITEMS = " + json.dumps(items, ensure_ascii=False, indent=2) + ";\n"
with open("C:/Users/admin/WorkBuddy/2026-09-17-11-26-50/备件耗材管理/seed.js", "w", encoding="utf-8") as f:
    f.write(js)
print("wrote seed.js with", len(items), "items; low-by-default =",
      sum(1 for it in items if it["stock"] - it["safety"] < 0))
