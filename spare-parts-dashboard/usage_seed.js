/* ============================================================
   使用履历数据源（USAGE_SEED）
   · 独立于 seed.js（库存数据源），请勿混用
   · 来源：DB 3# 设备备件履历表（手写）拍照 → AI 转写 → 原批人工核对
   · 批次：IMG_20260928_134829 · 转写 2026-09-28 · 核对 2026-09-29
   · 规则：备件统一称「吸嘴」；设备名 DB3#、型号 DA403D（不带点）
   ============================================================ */
const USAGE_SEED_META = {
  version: 4,
  batch: "IMG_20260928_134829",
  transcribedAt: "2026-09-28",
  correctedAt: "2026-09-29",
  sourceNote: "DB3# 设备备件履历表（手写）拍照转写，共 16 条；DB4# 错误记录已于 2026-09-29 删除"
};

const USAGE_SEED = [
  {
    id: "U1001", date: "7.21", equipment: "DB3#", model: "DA403D",
    part: "PA PD吸嘴", reason: "破损", preventive: "", maintTime: "7.21",
    handler: "韩林人钊", other: "", note: ""
  },
  {
    id: "U1002", date: "7.22", equipment: "DB3#", model: "DA403D",
    part: "BA PD吸嘴", reason: "破损", preventive: "", maintTime: "7.22",
    handler: "林典君", other: "", note: ""
  },
  {
    id: "U1003", date: "7.23", equipment: "DB3#", model: "DA403D",
    part: "PA TIA吸嘴", reason: "破损", preventive: "", maintTime: "7.23",
    handler: "陈旭东", other: "", note: ""
  },
  {
    id: "U1004", date: "8.9", equipment: "DB3#", model: "DA403D",
    part: "PA PD吸嘴", reason: "脏污寄样分析成分", preventive: "", maintTime: "8.9",
    handler: "雷雨", other: "", note: ""
  },
  {
    id: "U1005", date: "8.10", equipment: "DB3#", model: "DA403D",
    part: "PA PIC吸嘴", reason: "异物", preventive: "", maintTime: "8.10",
    handler: "林典君", other: "", note: ""
  },
  {
    id: "U1006", date: "8.17", equipment: "DB3#", model: "DA403D",
    part: "PA TIA吸嘴", reason: "百损", preventive: "", maintTime: "8.17",
    handler: "雷雨", other: "", note: ""
  },
  {
    id: "U1007", date: "8.18", equipment: "DB3#", model: "DA403D",
    part: "PA、BA TIA吸嘴", reason: "样品验证，改善异物", preventive: "", maintTime: "8.18",
    handler: "雷雨", other: "", note: ""
  },
  {
    id: "U1008", date: "8.29", equipment: "DB3#", model: "DA403D",
    part: "BA PD吸嘴", reason: "异物", preventive: "", maintTime: "8.29",
    handler: "韩林人钊", other: "", note: ""
  },
  {
    id: "U1009", date: "9.1", equipment: "DB3#", model: "DA403D",
    part: "PA PD吸嘴", reason: "异物、磨完无改善", preventive: "", maintTime: "9.1",
    handler: "林典君", other: "", note: ""
  },
  {
    id: "U1010", date: "9.16", equipment: "DB3#", model: "DA403D",
    part: "BA TIA适配器", reason: "磨损", preventive: "", maintTime: "9.16",
    handler: "韩林人钊", other: "", note: ""
  },
  {
    id: "U1011", date: "9.16", equipment: "DB3#", model: "DA403D",
    part: "PA TIA吸嘴", reason: "破损", preventive: "", maintTime: "9.16",
    handler: "韩林人钊", other: "", note: ""
  },
  {
    id: "U1012", date: "9.18", equipment: "DB3#", model: "DA403D",
    part: "PA COC吸嘴", reason: "破损", preventive: "", maintTime: "9.18",
    handler: "韩林人钊", other: "", note: ""
  },
  {
    id: "U1013", date: "9.18", equipment: "DB3#", model: "DA403D",
    part: "BA PD吸嘴", reason: "员工摔坏，破损", preventive: "", maintTime: "9.18",
    handler: "林典君", other: "", note: ""
  },
  {
    id: "U1014", date: "9.18", equipment: "DB3#", model: "DA403D",
    part: "BA PD吸嘴", reason: "破损，歪斜，无法拾取", preventive: "", maintTime: "9.18",
    handler: "林典君", other: "", note: ""
  },
  {
    id: "U1015", date: "9.27", equipment: "DB3#", model: "DA403D",
    part: "PA COC吸嘴", reason: "破损", preventive: "", maintTime: "9.27",
    handler: "韩林人钊", other: "", note: ""
  },
  {
    id: "U1016", date: "9.28", equipment: "DB3#", model: "DA403D",
    part: "PA PD吸嘴", reason: "磨损、影响识别", preventive: "", maintTime: "9.28",
    handler: "陈旭东", other: "", note: ""
  },
];
