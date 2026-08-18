# R0业务Agent公共底座

版本：`r0.1.0`  
范围：面向28个业务Agent需求设计的应用层公共能力；当前只装载四个重点工程样例  
状态：代码基线已建立，正式AI中台、数据中台和业务系统协议仍待外部确认

## 一、R0交付内容

R0固定公共开发调性和接口边界，不替甲方建设AI中台，也不替数据中台或业务系统维护权威数据、执行发布、交易、审批和处置。

| 交付面 | 当前实现 |
|---|---|
| Agent Runtime | 统一注册、Schema校验、身份与角色、租户、限流、幂等、安全、可靠性、LangGraph执行、审计、同步与异步 |
| Agent SDK | `app/lib/agent-sdk/index.ts`提供`defineAgentModule`；`templates/agent-module/`提供标准七件套模板 |
| 公共契约 | `app/lib/r0/contracts.ts`固定任务、错误、人工复核、Provider信封和健康状态Schema |
| Provider端口 | AI、知识检索、业务数据、业务动作、人工复核、任务队列、审计七类端口 |
| HTTP适配骨架 | `app/lib/r0/http-platform-ports.ts`提供四类外部平台HTTP适配器，统一租户、身份、Trace、来源和密级校验 |
| 研发平台 | `/runtime-center`、`/knowledge-admin`、`/evaluation-center`分别承载运行、知识治理和质量评测 |
| 接口中心 | `/api/openapi`用于展厅开发环境；独立Runtime使用`/openapi.json` |
| 质量门禁 | `pnpm run test:r0`及全量`pnpm run check`；R0测试已纳入默认测试链 |

## 二、部署结构

```text
业务系统 / 展厅 BFF
        │ 可信网关签名
        ▼
独立 Agent Runtime
  ├─ Registry + Agent SDK
  ├─ API Guard + Reliability + Safety
  ├─ LangGraph Agent Modules
  ├─ Async Task + Human Review
  ├─ Runtime Audit + Development Center
  └─ R0 Provider Ports
       ├─ AI Platform
       ├─ Knowledge Search
       ├─ Business Data
       └─ Business Action
```

Agent业务模块不得直接依赖Next.js、Cloudflare D1、Queue或某家模型SDK。业务节点只依赖Schema和Provider端口；HTTP、数据库和部署技术通过适配器替换。

## 三、公共HTTP接口

| 方法 | 路径 | 语义 |
|---|---|---|
| GET | `/health/live` | 进程存活和R0版本 |
| GET | `/health/ready` | 生产Provider、数据库、队列、网关和适配器就绪检查 |
| GET | `/openapi.json` | 独立Runtime契约 |
| GET | `/v1/agents` | 注册Agent、执行模式、时限与版本 |
| POST | `/v1/agents/{agentId}/invoke` | 同步调用；支持`Prefer: respond-async` |
| POST | `/v1/agents/{agentId}/tasks` | 为`async-capable` Agent显式创建异步任务 |
| GET | `/v1/tasks/{taskId}` | 按租户和主体查询任务 |
| POST | `/v1/tasks/{taskId}/cancel` | 取消尚未开始执行的任务；运行中任务不会虚假返回已取消 |
| POST | `/v1/reviews` | 提交人工复核事项 |
| GET | `/v1/reviews/{reviewId}` | 申请人或本租户复核角色查询状态 |
| POST | `/v1/reviews/{reviewId}/callback` | `human-reviewer`、`operator`或`admin`回传复核结果 |
| POST | `/v1/callbacks/{source}` | 其他上游回调的签名、去重入口 |

生产接口只接受可信网关身份。签名必须覆盖方法、路径、请求体、租户、主体、角色、时间戳、nonce及幂等/回调控制头。

## 四、七类Provider端口

| 端口 | 我方用途 | 外部责任 |
|---|---|---|
| `AIPlatformPort` | 语义理解、生成、模型能力调用 | 甲方AI中台提供正式能力和协议 |
| `KnowledgeSearchPort` | 受控检索、证据和知识版本读取 | 甲方AI中台或授权知识服务提供检索基础设施 |
| `BusinessDataPort` | 读取主体、订单、交易、内容、指标等权威业务数据 | 数据中台/业务系统维护数据 |
| `BusinessActionPort` | 提交建议、草稿或经批准动作请求 | 业务系统校验并执行；执行必须携带审批令牌与幂等键 |
| `HumanReviewPort` | 提交高风险复核事项并接收结果 | 人工复核系统和专业人员作最终判断 |
| `TaskQueuePort` | 长任务入队 | 部署环境提供Queue/RabbitMQ等实现 |
| `AuditStorePort` | 保存脱敏运行证据 | 部署环境提供合规存储和保留策略 |

外部HTTP信封必须携带租户、来源、生成时间和数据分级。业务数据、知识检索和动作结果缺少`source_ids`时，R0适配器拒绝把结果交给Agent。

## 五、Agent模块标准

新增Agent必须包含：

```text
types.ts
config.ts
providers.ts
adapters.ts
workflow.ts
module.ts
tests/
evals/
```

开发顺序：需求F编号追溯 → 场景与风险边界 → Zod Schema → Provider端口 → LangGraph节点 → Mock/正式适配器 → 负向测试 → 黄金评测 → Runtime注册。

每个模块必须登记能力、工作流、Prompt、规则和模型版本；高风险结果进入人工复核；生产Provider缺失时明确失败，不允许静默回落Mock。

## 六、人工复核语义

- Agent提交`reason`、证据和建议动作，不作正式认定。
- 申请人只能读取自己的复核事项；本租户`human-reviewer`、`operator`或`admin`可以读取和处理。
- 回调支持`approved`、`rejected`和`needs_more_information`。
- 相同决定重复回调保持幂等；不同决定覆盖已结束结果时返回冲突。
- 已过期复核项不能处理；正式业务动作仍由业务系统依据复核结果执行。

## 七、异步任务语义

- 创建任务必须携带`Idempotency-Key`。
- 同一主体、Agent和幂等键对应不同请求时返回冲突。
- 只有`queued`、`enqueue_failed`或`failed`状态可取消；`processing`状态不承诺强制中止。
- Queue原子领取任务；已取消任务不会进入处理状态。
- 正式部署应设置有限重试和死信队列，并保留Trace和错误码。

## 八、环境配置

开发环境可以使用确定性Mock和临时DeepSeek/Qwen兼容适配器；正式环境必须将所有Agent Provider设为`production`。

四类外部HTTP端口分别使用：

```text
JDZ_AI_PLATFORM_BASE_URL / JDZ_AI_PLATFORM_AUTH_TOKEN
JDZ_KNOWLEDGE_SEARCH_BASE_URL / JDZ_KNOWLEDGE_SEARCH_AUTH_TOKEN
JDZ_BUSINESS_DATA_BASE_URL / JDZ_BUSINESS_DATA_AUTH_TOKEN
JDZ_BUSINESS_ACTION_BASE_URL / JDZ_BUSINESS_ACTION_AUTH_TOKEN
```

临时RAG生成、Embedding和Rerank继续使用独立`MODEL_*`、`EMBEDDING_*`、`RERANK_*`配置。开发密钥只能保存在忽略提交的`.env.local`中。

## 九、数据库与部署

按顺序执行`db/migrations/0001`至`0007`。`0007_r0_agent_foundation.sql`增加人工复核表和租户索引。

当前Cloudflare Worker、D1和Queue是可运行参考实现。迁移到Kubernetes、PostgreSQL、Redis和RabbitMQ时，应替换Runtime绑定和存储/队列适配器，不改Agent业务工作流及R0公共契约。

## 十、当前团队继续完成

- 后端架构负责人：把七类R0端口落到甲方最终技术规范，补齐容器化入口、PostgreSQL/Redis/消息队列适配、可观测性和发布体系。
- Agent应用开发负责人：持续完善当前四个Agent的业务工作流、Prompt、RAG策略、负向场景和效果评测；未经范围变更不启动其他Agent。
- 两名实习生：分别维护四Agent黄金评测/需求追溯和契约夹具/开发环境，不独立决定高风险规则或生产安全策略。

当前四个Agent均已通过R0模块、公共端口和人工复核桥接审计。R0完成表示研发公共边界与可运行参考实现就绪，不表示28个Agent全部完成、甲方AI中台已联调或项目通过生产验收。
