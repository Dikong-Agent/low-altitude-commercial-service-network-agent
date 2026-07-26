import type { DemoProduct } from "./types";

export const DEMO_PRODUCT_CATALOG: DemoProduct[] = [
  {
    id: "DEMO-X8", name: "样例·云巡 X8", aliases: ["云巡 X8", "云巡X8", "X8"], category: "行业巡检无人机",
    description: "强调长续航和快速交付的园区巡检样例机型。", scenarios: ["园区巡检", "电力巡检", "测绘"],
    priceYuan: 168000, enduranceMinutes: 55, payloadKg: 2.5, windResistanceMps: 12, ingressProtection: "IP54",
    operatingTemperature: "-20℃～50℃", deliveryDays: 25, warrantyMonths: 24, trainingIncluded: true,
    source: "Mock产品参数库 v1.0 / DEMO-X8", updatedAt: "2026-07-26",
  },
  {
    id: "DEMO-T60", name: "样例·山岳 T60", aliases: ["山岳 T60", "山岳T60", "T60"], category: "重载巡检无人机",
    description: "强调重载、抗风和复杂环境作业的样例机型。", scenarios: ["山区巡检", "电力巡检", "应急保障"],
    priceYuan: 198000, enduranceMinutes: 45, payloadKg: 4, windResistanceMps: 14, ingressProtection: "IP55",
    operatingTemperature: "-20℃～50℃", deliveryDays: 42, warrantyMonths: 24, trainingIncluded: true,
    source: "Mock产品参数库 v1.0 / DEMO-T60", updatedAt: "2026-07-26",
  },
  {
    id: "DEMO-S3", name: "样例·灵鹞 S3", aliases: ["灵鹞 S3", "灵鹞S3", "S3"], category: "轻型巡检无人机",
    description: "强调成本和便携性的轻量巡检样例机型。", scenarios: ["园区巡检", "入门巡检", "轻量航拍"],
    priceYuan: 98000, enduranceMinutes: 42, payloadKg: 1.5, windResistanceMps: 10, ingressProtection: "IP45",
    operatingTemperature: "-10℃～45℃", deliveryDays: 14, warrantyMonths: 12, trainingIncluded: false,
    source: "Mock产品参数库 v1.0 / DEMO-S3", updatedAt: "2026-07-26",
  },
  {
    id: "DEMO-M5", name: "样例·绘界 M5", aliases: ["绘界 M5", "绘界M5", "M5"], category: "测绘无人机",
    description: "面向测绘与长航线覆盖的样例机型。", scenarios: ["测绘", "园区巡检", "工程勘察"],
    priceYuan: 138000, enduranceMinutes: 50, payloadKg: 2, windResistanceMps: 11, ingressProtection: "IP54",
    operatingTemperature: "-15℃～50℃", deliveryDays: 28, warrantyMonths: 18, trainingIncluded: true,
    source: "Mock产品参数库 v1.0 / DEMO-M5", updatedAt: "2026-07-26",
  },
  {
    id: "DEMO-R6", name: "样例·迅援 R6", aliases: ["迅援 R6", "迅援R6", "R6"], category: "应急保障无人机",
    description: "强调大载荷与恶劣环境适应性的样例机型。", scenarios: ["应急保障", "物资投送", "山区巡检"],
    priceYuan: 225000, enduranceMinutes: 40, payloadKg: 5, windResistanceMps: 15, ingressProtection: "IP55",
    operatingTemperature: "-20℃～55℃", deliveryDays: 50, warrantyMonths: 24, trainingIncluded: true,
    source: "Mock产品参数库 v1.0 / DEMO-R6", updatedAt: "2026-07-26",
  },
  {
    id: "DEMO-A2", name: "样例·轻翼 A2", aliases: ["轻翼 A2", "轻翼A2", "A2"], category: "入门航拍无人机",
    description: "面向轻量航拍与基础展示的入门样例机型。", scenarios: ["轻量航拍", "培训教学"],
    priceYuan: 48000, enduranceMinutes: 32, payloadKg: 0.8, windResistanceMps: 8, ingressProtection: "IP43",
    operatingTemperature: "0℃～40℃", deliveryDays: 7, warrantyMonths: 12, trainingIncluded: false,
    source: "Mock产品参数库 v1.0 / DEMO-A2", updatedAt: "2026-07-26",
  },
  {
    id: "DEMO-C1", name: "样例·晴空 C1", aliases: ["晴空 C1", "晴空C1", "C1"], category: "入门航拍无人机",
    description: "面向初次使用者、轻量航拍和培训展示的入门样例机型。", scenarios: ["轻量航拍", "培训教学"],
    priceYuan: 26800, enduranceMinutes: 28, payloadKg: 0.5, windResistanceMps: 7, ingressProtection: "IP42",
    operatingTemperature: "0℃～40℃", deliveryDays: 5, warrantyMonths: 12, trainingIncluded: true,
    source: "Mock产品参数库 v1.1 / DEMO-C1", updatedAt: "2026-07-26",
  },
];
