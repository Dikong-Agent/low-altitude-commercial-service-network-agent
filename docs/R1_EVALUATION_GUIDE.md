# R1自动化评测说明

R1评测分为三层：

1. `pnpm run typecheck`与`pnpm run lint`检查类型和代码质量；
2. Node测试覆盖统一Runtime、契约、鉴权、审计、幂等、超时、熔断、异步任务、生产适配边界以及五个样板Agent的业务流程；
3. `pnpm run eval:r1`读取`evals/r1-golden-cases.json`，通过与前端相同的统一调用入口执行15个黄金用例，并生成`reports/r1-evaluation-report.json`。

黄金用例覆盖正常、无数据、冲突、澄清、高风险人工复核和正式适配边界。评测结果必须全部通过；任一用例失败均使质量门禁失败。

能力覆盖由`tests/r1-baseline.test.mjs`从当前`docs/FILE_CATALOG.md`定位v3.41功能导图，逐项比对五个样板Agent的能力名称和上位需求编号。功能导图变化后，未同步的能力清单会直接导致测试失败。

本评测只证明Mock阶段的流程、边界和结构化结果可重复，不证明正式AI中台接口、正式业务数据、模型真实效果、生产性能或三方验收完成。
