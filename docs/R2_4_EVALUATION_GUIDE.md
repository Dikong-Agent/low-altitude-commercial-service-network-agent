# R2最后批黄金评测说明

本评测覆盖AG-013智库、头条解读Agent与AG-018合同履约监控Agent。每个Agent配置8条黄金用例，覆盖正常、输入缺失、冲突、无数据、超时和业务边界六类门禁。

运行：

```bash
pnpm run build
pnpm run eval:r2:batch4
```

评测数据位于`evals/r2-batch4-golden-cases.json`，报告输出到`reports/r2-batch4-evaluation-report.json`。

验收边界：AG-013不执行发布、推送、下架或权威认定；AG-018不执行违约认定、付款、扣款、赔付、处罚、续签或终止。正式接口、真实数据和生产验收不在本轮Mock工程验收范围内。
