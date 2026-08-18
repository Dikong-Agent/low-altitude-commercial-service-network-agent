# R2首批评测说明

## 范围

本轮评测R2首批AG-005、AG-010、AG-004和AG-019。四名Agent分别覆盖7项、16项、19项和3项主承载功能，共45项及8条工作流，来源以R2首批Agent开发清单和当前v3.41功能导图为准。

## 执行

```bash
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run test:runtime
pnpm run eval:r1
pnpm run eval:r2
```

`eval:r2`通过统一调用入口执行`evals/r2-golden-cases.json`。每名Agent各8项，共32项，逐Agent覆盖正常、输入缺失、冲突、无数据、超时和业务边界；同时覆盖报价过期、推荐反馈、配件过期/不兼容、安装专业复核和跨类型查重。结果写入`reports/r2-evaluation-report.json`。

超时用例仅在评测进程显式设置`R2_EVAL_ENABLE_FAULTS=true`时注册`test-timeout` Provider。生产模式要求所有Provider为`production`，因此该故障注入不能作为正式数据或生产Provider使用。

## 判定边界

评测通过只证明Mock阶段业务行为、契约、追溯和异常输出可重复。正式AI中台能力、业务数据、用户权限以及采购、报名、安装、删除和下架执行均需要三方正式接口后在R4联调，不属于本报告结论。
