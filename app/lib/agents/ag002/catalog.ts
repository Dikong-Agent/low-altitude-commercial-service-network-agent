import type { DemoManualAsset } from "./types";

export const DEMO_MANUALS: DemoManualAsset[] = [
  {
    id: "DEMO-MANUAL-X8",
    title: "样例·云巡 X8 无人机用户手册",
    productName: "样例·云巡 X8",
    version: "v0.9-demo",
    updatedAt: "2026-07-26",
    aliases: ["云巡 X8", "X8", "样例无人机"],
    structure: { chapters: 7, tables: 4, figures: 9, scannedPages: 2 },
    sections: [
      {
        id: "x8-overview", title: "1.2 核心功能与使用限制", pageStart: 4, pageEnd: 6,
        topics: ["overview", "terminology"], scenarios: ["产品了解"],
        text: "本机支持GNSS定位、自动返航RTH、航线任务和失控保护。自动功能不能替代操作者对环境、空域和设备状态的判断。",
        plainLanguage: "这台样例设备具备定位、自动返航、航线任务和失控保护，但自动功能不能替代人工飞行判断。",
        imageCaptions: ["图1-3：机体部件与GNSS天线位置示意"], steps: [], risks: [],
        glossary: [
          { term: "GNSS", aliases: ["卫星定位"], plainExplanation: "利用卫星信号判断设备位置；卫星数量不足或受遮挡时，定位可能不稳定。" },
          { term: "RTH", aliases: ["自动返航"], plainExplanation: "Return to Home，设备按预设条件返回已记录的返航点。" },
          { term: "返航点", aliases: ["Home点"], plainExplanation: "设备准备返航时使用的目标位置，起飞前应确认已正确更新。" },
          { term: "IMU", aliases: ["惯性测量单元"], plainExplanation: "感知姿态和运动变化的传感器组件，异常时应按提示检查或校准。" },
          { term: "失控保护", aliases: ["Failsafe"], plainExplanation: "遥控信号中断时触发的预设安全动作，可能是返航、悬停或降落。" },
        ],
      },
      {
        id: "x8-compliance", title: "2.1 合规与作业边界", pageStart: 8, pageEnd: 9,
        topics: ["compliance", "safety"], scenarios: ["飞行", "飞行前检查"],
        text: "操作者应确认当前空域允许飞行，按适用要求完成申报或审批，并在目视范围和手册限制内作业。不得进入禁限飞区域。",
        plainLanguage: "起飞前必须确认空域、审批和操作边界；样例手册不能代替现行法规或主管部门要求。",
        imageCaptions: [], steps: [], glossary: [],
        risks: [
          { level: "compliance", label: "空域与审批", detail: "确认当前空域允许飞行，并按适用要求完成申报或审批。" },
          { level: "prohibited", label: "禁限飞区域", detail: "不得进入禁飞或未经许可的限制区域。" },
        ],
      },
      {
        id: "x8-preflight", title: "3.1 飞行前安全检查", pageStart: 12, pageEnd: 15,
        topics: ["operation", "safety"], scenarios: ["飞行前检查", "开机", "飞行"],
        text: "检查机臂、桨叶和电池锁止状态；确认电量不低于30%，GNSS卫星不少于12颗，返航点已更新，返航高度高于周边障碍物。雨雪、能见度不足或持续风速超过10m/s时不得起飞。",
        plainLanguage: "飞行前按“机体与桨叶—电池—定位—返航设置—天气与空域”的顺序检查，任何关键项不满足都不要起飞。",
        imageCaptions: ["图3-2：桨叶缺口与裂纹检查示例", "图3-4：返航点更新状态截图"], glossary: [],
        steps: [
          { title: "检查机体与桨叶", instruction: "确认机臂锁止，桨叶没有裂纹、缺口、明显变形或松动。", condition: "设备断电且桨叶停止", safetyNote: "发现损伤必须更换，不得带伤起飞。" },
          { title: "确认电池状态", instruction: "确认电池无鼓包、破损或渗漏，电量不低于30%，并完全推入直至锁扣到位。", condition: "电池温度处于允许范围", safetyNote: "异常电池应隔离，禁止继续充电或装机。" },
          { title: "检查定位状态", instruction: "开机后等待GNSS卫星数量达到12颗及以上，并确认没有罗盘或IMU异常提示。", condition: "在开阔、远离强磁干扰的位置", safetyNote: "定位状态不稳定时不要起飞。" },
          { title: "核对返航设置", instruction: "确认返航点已经更新，并把返航高度设为高于航线附近最高障碍物的安全高度。", condition: "地图和定位信息正常", safetyNote: "返航点错误可能导致设备飞向非预期位置。" },
          { title: "确认环境和空域", instruction: "确认无雨雪、能见度满足观察要求、持续风速不超过10m/s，并核对空域状态。", condition: "正式起飞前", safetyNote: "天气或空域条件不满足时取消飞行。" },
        ],
        risks: [
          { level: "warning", label: "定位与返航风险", detail: "GNSS不足、返航点错误或返航高度过低会增加失控后的碰撞风险。" },
          { level: "prohibited", label: "禁止带故障起飞", detail: "桨叶损伤、电池异常、定位告警或恶劣天气下不得起飞。" },
        ],
      },
      {
        id: "x8-charging", title: "4.2 电池充电与存放", pageStart: 22, pageEnd: 24,
        topics: ["operation", "safety"], scenarios: ["充电", "维护"],
        text: "仅使用配套充电器，在5℃至40℃、通风且无可燃物的环境中充电。飞行后至少静置30分钟。充电期间不得无人看管。",
        plainLanguage: "电池先冷却，再在通风、无可燃物的环境中使用配套充电器充电，并全程有人看护。",
        imageCaptions: ["图4-6：电池状态灯与异常闪烁模式"], glossary: [],
        steps: [
          { title: "冷却并检查电池", instruction: "飞行后静置至少30分钟，确认电池没有鼓包、渗漏或异味。", condition: "开始充电前", safetyNote: "异常电池不得继续使用。" },
          { title: "准备充电环境", instruction: "在5℃至40℃、通风、干燥且远离可燃物的位置连接配套充电器。", condition: "环境满足手册要求", safetyNote: "不得覆盖充电器或阻塞散热。" },
          { title: "看护充电过程", instruction: "观察状态灯和温度，出现异常闪烁、异味或过热时立即断开电源。", condition: "整个充电过程", safetyNote: "禁止无人看管充电。" },
        ],
        risks: [
          { level: "warning", label: "热失控风险", detail: "高温、损伤或异常电池继续充电可能引发起火。" },
          { level: "prohibited", label: "禁止无人看管", detail: "充电过程中不得离开现场或在可燃物附近充电。" },
        ],
      },
      {
        id: "x8-position-drift", title: "6.3 定位漂移排查", pageStart: 38, pageEnd: 40,
        topics: ["troubleshooting", "safety", "operation"], scenarios: ["定位漂移", "故障排查", "飞行"],
        text: "定位漂移时先将设备移至开阔区域，检查GNSS卫星数量和罗盘干扰提示。仅在应用提示且环境无磁干扰时执行罗盘校准。漂移持续或姿态异常时应立即安全降落并停用检查。",
        plainLanguage: "定位漂移应按“移到开阔区—看卫星数量—排除磁干扰—按提示校准—仍异常则降落停用”的顺序处理。",
        imageCaptions: ["图6-8：GNSS弱与罗盘干扰提示界面"], glossary: [],
        steps: [
          { title: "转移到开阔区域", instruction: "远离建筑遮挡、高压线、车辆和大面积金属物，再观察定位状态。", condition: "尚未起飞或可安全降落", safetyNote: "不要为了恢复定位继续深入复杂环境。" },
          { title: "检查GNSS状态", instruction: "确认卫星数量达到12颗及以上，并等待定位状态稳定。", condition: "界面可正常显示卫星数量", safetyNote: "卫星不足时不要强行起飞。" },
          { title: "排查罗盘干扰", instruction: "查看罗盘告警，关闭或远离可能产生强磁场的设备和金属结构。", condition: "出现罗盘干扰提示", safetyNote: "不要在车辆旁、钢筋结构内或高压线附近校准。" },
          { title: "按提示执行校准", instruction: "仅在应用明确提示且环境无磁干扰时，按界面步骤完成罗盘校准。", condition: "已排除环境干扰", safetyNote: "无提示时不要反复校准掩盖故障。" },
          { title: "异常持续则降落停用", instruction: "漂移、姿态异常或告警持续时，选择安全地点降落并停止使用，交由人员检查。", condition: "前述检查无法恢复", safetyNote: "不要继续执行任务或依赖自动返航。" },
        ],
        risks: [
          { level: "warning", label: "持续漂移", detail: "定位或姿态异常持续时应安全降落并停止任务。" },
          { level: "prohibited", label: "禁止带告警继续作业", detail: "不得在持续定位、罗盘或姿态告警下继续飞行。" },
        ],
      },
      {
        id: "x8-emergency", title: "5.4 失控保护与紧急处置", pageStart: 31, pageEnd: 33,
        topics: ["operation", "safety", "troubleshooting", "terminology"], scenarios: ["失控", "返航", "紧急处置"],
        text: "遥控链路中断后，设备按照预设的失控保护动作执行返航、悬停或降落。操作者应在起飞前确认动作类型、返航点和返航高度。",
        plainLanguage: "失控保护不是万能保险；起飞前要确认断联后的动作、返航点和高度，异常时优先保证人员安全。",
        imageCaptions: ["图5-5：失控保护动作配置界面"],
        steps: [
          { title: "起飞前核对保护动作", instruction: "确认断联后执行返航、悬停还是降落，并核对返航点和返航高度。", condition: "每次任务开始前", safetyNote: "错误配置可能放大断联风险。" },
          { title: "保持观察并准备接管", instruction: "发生断联时观察设备运动方向和周边人员，信号恢复后在安全条件下接管。", condition: "遥控链路中断", safetyNote: "不要追逐设备或进入危险区域。" },
        ],
        risks: [{ level: "warning", label: "自动保护边界", detail: "失控保护依赖正确的定位、返航点和参数设置，不能替代人工风险判断。" }],
        glossary: [
          { term: "失控保护", aliases: ["Failsafe"], plainExplanation: "遥控信号中断后由设备自动执行的预设安全动作。" },
          { term: "返航点", aliases: ["Home点"], plainExplanation: "设备自动返航时使用的目标位置。" },
        ],
      },
      {
        id: "x8-maintenance", title: "7.1 日常维护与检查", pageStart: 42, pageEnd: 45,
        topics: ["operation", "safety", "overview"], scenarios: ["维护", "保养"],
        text: "每次作业后清洁机体和传感器表面，检查桨叶、电机和连接件。累计飞行50小时后执行周期检查。不得使用高压水流或腐蚀性清洁剂。",
        plainLanguage: "每次飞行后做清洁和外观检查，累计50小时做周期检查；清洁时避免高压水和腐蚀性液体。",
        imageCaptions: ["图7-1：视觉传感器清洁区域"], glossary: [],
        steps: [
          { title: "清洁机体与传感器", instruction: "断电后使用柔软干布清洁机体和传感器表面。", condition: "每次作业后", safetyNote: "禁止使用高压水流或腐蚀性清洁剂。" },
          { title: "检查易损件", instruction: "检查桨叶、电机、机臂锁止和连接件是否磨损、松动或变形。", condition: "清洁完成后", safetyNote: "发现异常先停用再处理。" },
          { title: "执行周期检查", instruction: "累计飞行50小时后，按维护清单检查动力、结构和传感器状态。", condition: "达到维护周期", safetyNote: "超期未检查不应继续高强度作业。" },
        ],
        risks: [{ level: "prohibited", label: "禁止带病运行", detail: "发现结构、动力或传感器异常后不得继续使用。" }],
      },
    ],
  },
];

