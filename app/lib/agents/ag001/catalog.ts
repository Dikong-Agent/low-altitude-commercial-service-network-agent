import type { DemoProduct, ProductSourceRecord } from "./types";

const BASE_PRODUCT_CATALOG: Array<Omit<DemoProduct, "capabilities" | "sourceRecords">> = [
  {
    id: "DEMO-X8", name: "样例·云巡 X8", aliases: ["云巡 X8", "云巡X8", "X8"], category: "行业巡检无人机",
    description: "强调长续航和快速交付的园区巡检样例机型。", scenarios: ["园区巡检", "电力巡检", "测绘"],
    priceYuan: 168000, enduranceMinutes: 55, payloadKg: 2.5, windResistanceMps: 12, maxOperatingAltitudeM: 5000, ingressProtection: "IP54",
    operatingTemperature: "-20℃～50℃", deliveryDays: 25, warrantyMonths: 24, trainingIncluded: true,
    useLimitations: ["标称续航存在两份资料口径差异，选型前需确认测试工况", "2.5公斤载荷以上任务需改用重载型号"],
    source: "Mock产品参数库 v1.0 / DEMO-X8", updatedAt: "2026-07-26",
  },
  {
    id: "DEMO-T60", name: "样例·山岳 T60", aliases: ["山岳 T60", "山岳T60", "T60"], category: "重载巡检无人机",
    description: "强调重载、抗风和复杂环境作业的样例机型。", scenarios: ["山区巡检", "电力巡检", "应急保障"],
    priceYuan: 198000, enduranceMinutes: 45, payloadKg: 4, windResistanceMps: 14, maxOperatingAltitudeM: 6000, ingressProtection: "IP55",
    operatingTemperature: "-20℃～50℃", deliveryDays: 42, warrantyMonths: 24, trainingIncluded: true,
    useLimitations: ["交付周期较长", "高载荷任务需根据海拔、温度和风况复核实际航时"],
    source: "Mock产品参数库 v1.0 / DEMO-T60", updatedAt: "2026-07-26",
  },
  {
    id: "DEMO-S3", name: "样例·灵鹞 S3", aliases: ["灵鹞 S3", "灵鹞S3", "S3"], category: "轻型巡检无人机",
    description: "强调成本和便携性的轻量巡检样例机型。", scenarios: ["园区巡检", "入门巡检", "轻量航拍"],
    priceYuan: 98000, enduranceMinutes: 42, payloadKg: 1.5, windResistanceMps: 10, maxOperatingAltitudeM: null, ingressProtection: "IP45",
    operatingTemperature: "-10℃～45℃", deliveryDays: 14, warrantyMonths: 12, trainingIncluded: false,
    useLimitations: ["最大作业海拔资料缺失", "不含培训服务，不适合作为重载或复杂气象任务首选"],
    source: "Mock产品参数库 v1.0 / DEMO-S3", updatedAt: "2026-07-26",
  },
  {
    id: "DEMO-M5", name: "样例·绘界 M5", aliases: ["绘界 M5", "绘界M5", "M5"], category: "测绘无人机",
    description: "面向测绘与长航线覆盖的样例机型。", scenarios: ["测绘", "园区巡检", "工程勘察"],
    priceYuan: 138000, enduranceMinutes: 50, payloadKg: 2, windResistanceMps: 11, maxOperatingAltitudeM: 4500, ingressProtection: "IP54",
    operatingTemperature: "-15℃～50℃", deliveryDays: 28, warrantyMonths: 18, trainingIncluded: true,
    useLimitations: ["侧重测绘任务，重载与高风速场景需另行评估"],
    source: "Mock产品参数库 v1.0 / DEMO-M5", updatedAt: "2026-07-26",
  },
  {
    id: "DEMO-R6", name: "样例·迅援 R6", aliases: ["迅援 R6", "迅援R6", "R6"], category: "应急保障无人机",
    description: "强调大载荷与恶劣环境适应性的样例机型。", scenarios: ["应急保障", "物资投送", "山区巡检"],
    priceYuan: 225000, enduranceMinutes: 40, payloadKg: 5, windResistanceMps: 15, maxOperatingAltitudeM: 6500, ingressProtection: "IP55",
    operatingTemperature: "-20℃～55℃", deliveryDays: 50, warrantyMonths: 24, trainingIncluded: true,
    useLimitations: ["参考价格和交付周期均处于候选高位", "长航时任务需评估载荷对续航的影响"],
    source: "Mock产品参数库 v1.0 / DEMO-R6", updatedAt: "2026-07-26",
  },
  {
    id: "DEMO-A2", name: "样例·轻翼 A2", aliases: ["轻翼 A2", "轻翼A2", "A2"], category: "入门航拍无人机",
    description: "面向轻量航拍与基础展示的入门样例机型。", scenarios: ["轻量航拍", "培训教学"],
    priceYuan: 48000, enduranceMinutes: 32, payloadKg: 0.8, windResistanceMps: 8, maxOperatingAltitudeM: 3000, ingressProtection: "IP43",
    operatingTemperature: "0℃～40℃", deliveryDays: 7, warrantyMonths: 12, trainingIncluded: false,
    useLimitations: ["载荷、抗风和防护能力仅适用于轻量任务", "不含培训服务"],
    source: "Mock产品参数库 v1.0 / DEMO-A2", updatedAt: "2026-07-26",
  },
  {
    id: "DEMO-C1", name: "样例·晴空 C1", aliases: ["晴空 C1", "晴空C1", "C1"], category: "入门航拍无人机",
    description: "面向初次使用者、轻量航拍和培训展示的入门样例机型。", scenarios: ["轻量航拍", "培训教学"],
    priceYuan: 26800, enduranceMinutes: 28, payloadKg: 0.5, windResistanceMps: 7, maxOperatingAltitudeM: 2500, ingressProtection: "IP42",
    operatingTemperature: "0℃～40℃", deliveryDays: 5, warrantyMonths: 12, trainingIncluded: true,
    useLimitations: ["仅适用于轻量航拍与教学展示", "不适合行业巡检、复杂气象或重载任务"],
    source: "Mock产品参数库 v1.1 / DEMO-C1", updatedAt: "2026-07-26",
  },
];

const capabilitiesByProduct: Record<string, string[]> = {
  "DEMO-X8": ["RTK"],
  "DEMO-T60": ["RTK", "热成像"],
  "DEMO-S3": [],
  "DEMO-M5": ["RTK"],
  "DEMO-R6": ["热成像"],
  "DEMO-A2": [],
  "DEMO-C1": [],
};

const sourceRecordsByProduct: Record<string, ProductSourceRecord[]> = {
  "DEMO-X8": [
    { id: "SRC-X8-SPEC", title: "X8规格参数卡", version: "v1.0", updatedAt: "2026-07-26", content: "标称续航55分钟；有效载荷2.5公斤；抗风12米/秒；最大作业海拔5000米；参考价格16.8万元；交付25天；质保24个月；防护等级IP54；支持RTK。" },
    { id: "SRC-X8-BROCHURE", title: "X8产品介绍页", version: "v1.1", updatedAt: "2026-07-28", content: "标准工况续航52分钟；载荷2500克；抗风43.2公里/小时；参考价格168000元；质保2年。" },
  ],
  "DEMO-T60": [
    { id: "SRC-T60-SPEC", title: "T60规格参数卡", version: "v1.0", updatedAt: "2026-07-26", content: "标称续航45分钟；有效载荷4公斤；抗风14米/秒；最大作业海拔6000米；参考价格19.8万元；防护等级IP55；支持RTK和热成像。" },
    { id: "SRC-T60-SERVICE", title: "T60交付服务说明", version: "v1.0", updatedAt: "2026-07-26", content: "交付周期42天；质保2年；培训服务包含。" },
  ],
  "DEMO-S3": [
    { id: "SRC-S3-SPEC", title: "S3规格参数卡", version: "v1.0", updatedAt: "2026-07-26", content: "续航42分钟；载荷1500克；抗风10米/秒；参考价格9.8万元；交付14天；防护等级IP45。" },
  ],
  "DEMO-M5": [
    { id: "SRC-M5-SPEC", title: "M5规格参数卡", version: "v1.0", updatedAt: "2026-07-26", content: "续航50分钟；载荷2公斤；抗风39.6公里/小时；最大作业海拔4500米；参考价格13.8万元；交付4周；质保18个月；防护等级IP54；支持RTK。" },
  ],
  "DEMO-R6": [
    { id: "SRC-R6-SPEC", title: "R6规格参数卡", version: "v1.0", updatedAt: "2026-07-26", content: "续航40分钟；载荷5公斤；抗风15米/秒；最大作业海拔6500米；参考价格22.5万元；交付50天；质保24个月；防护等级IP55；支持热成像。" },
  ],
  "DEMO-A2": [
    { id: "SRC-A2-SPEC", title: "A2规格参数卡", version: "v1.0", updatedAt: "2026-07-26", content: "续航32分钟；载荷0.8公斤；抗风8米/秒；参考价格4.8万元；交付7天；质保12个月；防护等级IP43。" },
  ],
  "DEMO-C1": [
    { id: "SRC-C1-SPEC", title: "C1规格参数卡", version: "v1.1", updatedAt: "2026-07-26", content: "续航28分钟；载荷500克；抗风7米/秒；参考价格26800元；交付5天；质保1年；防护等级IP42。" },
  ],
};

export const DEMO_PRODUCT_CATALOG: DemoProduct[] = BASE_PRODUCT_CATALOG.map((product) => ({
  ...product,
  capabilities: [...(capabilitiesByProduct[product.id] ?? [])],
  sourceRecords: (sourceRecordsByProduct[product.id] ?? []).map((record) => ({ ...record })),
}));
