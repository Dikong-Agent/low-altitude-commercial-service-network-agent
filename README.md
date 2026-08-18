# 景德镇低空商业服务网 Agent 能力展厅 v2.6

本工程是四个重点业务 Agent 的研发与演示基线。当前运行范围只包含 AG-001、AG-012、AG-025、AG-027。AG-002、AG-003仅保留未注册参考源码；其他Agent不进入当前注册、测试和部署链。

需求范围仍保留 28 个业务 Agent 和 781 项细分功能。本次收口只调整当前研发优先级，不能表述为其余 Agent 需求已取消，也不能把四个工程样例表述为 28 个 Agent 已交付。

## 当前四个工程样例

| Agent | 重点能力 | 工程形态 |
|---|---|---|
| AG-001 低空产品型号对比 | 参数归一、硬约束校验、可解释选型 | 结构化决策 RAG + LangGraph |
| AG-012 政策、标准解读 | 政策对象隔离、版本时效、逐结论引用 | 政策 RAG + 版本链核验 |
| AG-025 智能客服 | 多意图识别、只读业务数据、专业 Agent 协同、人工复核 | 多 Agent 编排 + 会话状态 |
| AG-027 数据智能分析 | 指标口径、趋势异常、数据质量、审慎归因 | 语义问数 + 指标治理 |

全部业务材料和经营数据均为演示样例；仅 AG-012 包含一项经国务院官网核验的公开法规摘录。页面结果不触发发布、交易、审批、调度、处罚、授信或其他正式业务动作。

## R0统一研发框架

- `app/lib/agent-sdk/`：统一 Agent 模块声明、版本和复核桥接。
- `app/lib/r0/`：公共契约、OpenAPI、AI/知识/数据/动作/复核/任务/审计七类端口。
- `app/lib/agents/agxxx/`：每个 Agent 独立保留 types、config、providers、adapters、workflow、module、tests、evals。
- `app/lib/agent-runtime-registry.ts`：当前只装载四个 Agent 模块。
- `/runtime-center`：运行版本、Provider 状态、审计与接口状态。
- `/knowledge-admin`：知识登记、审核、发布、撤回、回滚与 QA 抽检。
- `/evaluation-center`：四 Agent 的 200 题 RAG 工程评测和质量门禁。
- `HumanReviewPort`：所有 `needs_review` 结果创建带编号、状态和有效期的复核任务。

当前 R0 模块保留既有业务工作流，通过统一 SDK 和端口完成迁移桥接；正式 AI 中台、数据中台和业务系统协议确定后，再替换 HTTP/存储/队列适配器，不重写 Agent 业务工作流。

## 知识与评测基线

- `knowledge/catalog.json`：15 项治理知识档案，覆盖当前四个 Agent。
- `knowledge/AG-027_指标与分析治理/`：指标字典、数据血缘和分析边界演示资料。
- `evals/four-agent-golden-cases.json`：16 个代表性业务与边界场景。
- `reports/four-agent-evaluation-report.json`：四 Agent 行为黄金集报告。
- `reports/rag-evaluation-baseline-20260814.json`：200 题 RAG 质量门禁报告。
- `pnpm run audit:r0-migration`：核验四模块注册、七件套、SDK、端口、Schema、工作流、复核与能力追溯。

当前验证以自动测试和评测报告为准；本地结果只证明工程样例通过研发门禁，不代表正式接口或生产验收完成。

## 接口

- `GET /api/agents`：仅返回当前四个 Agent。
- `POST /api/agents/:agentId/invoke`：统一同步调用入口；非当前范围 Agent 返回 404。
- `GET /api/openapi`：研发接口契约。
- `GET /api/runtime-center`：研发运行状态。
- `GET /api/knowledge-admin`：知识治理状态。
- `GET /api/rag-evaluation`：评测中心状态。
- `GET /api/rag/health`：RAG 运行状态。

生产接口只接受可信网关身份；演示身份仅在非生产环境内部映射。外部 Provider 缺失时必须明确失败，不允许生产环境静默回落 Mock。

## 本地运行

```bash
pnpm install
pnpm run build
node scripts/start-production.mjs --port 4319 --hostname 127.0.0.1
```

质量门禁：

```bash
pnpm run typecheck
pnpm run lint
pnpm run test:r0
pnpm run test:runtime
pnpm run eval:four
pnpm run eval:rag
pnpm run eval:rag:center
pnpm run audit:r0-migration
```

临时 DeepSeek/Qwen 密钥只保存在被忽略提交的 `.env.local`。临时模型接入不等于甲方 AI 中台已完成联调。

## 责任边界

- 我方：四个当前 Agent 样例、R0应用框架、Prompt与工作流、RAG策略、业务规则、适配器、Mock、测试和联调准备。
- 甲方：正式 AI 中台、模型与算力、平台级知识与编排能力。
- 平级合作商：数据中台、业务系统、权威业务数据和正式执行接口。
- 专业人员/业务系统：高风险结果复核和最终业务动作。

当前成果是研发工程基线和样例能力，不代表正式数据效果、三方接口联调或生产验收完成。
