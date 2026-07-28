# 商业化 Agent Runtime 架构

## 目标与边界

本工程只承载业务 Agent 的注册、编排、调用治理和运行审计。可信身份由甲方网关签发；模型、检索、OCR 等能力由甲方 AI 中台提供；商品、文档、政策、订单等数据由数据中台或业务系统提供。Agent Runtime 不替代上述平台，也不直接承担业务发布、交易、工单落库等执行责任。

## 运行结构

```text
业务系统 / 展厅 BFF
        │ 可信网关签名
        ▼
独立 Agent Runtime
  ├─ 统一注册表：Schema、访问策略、总时限、版本、执行模式
  ├─ API 门禁：租户、配额、限流、幂等、安全检查
  ├─ LangGraph 业务工作流
  ├─ 公共端口：AI 能力、业务访问上下文、领域数据、工具执行
  ├─ 可靠性：总时间预算、取消传递、分类重试、抖动退避、D1 熔断
  ├─ 异步任务：D1 任务状态 + Queue；只在 async-capable Agent 明确请求时使用
  └─ 运行审计：版本、依赖耗时、重试、状态和内部 Trace
        ├─ 甲方 AI 中台适配器
        └─ 数据中台 / 业务系统适配器
```

前端展厅继续使用 `/api/agents/:id/invoke` 作为同源 BFF；生产业务系统可独立部署 `worker/agent-runtime.ts`，使用 `/v1/agents/:id/invoke`。两者调用同一个 Runtime handler，不复制业务逻辑。

## 统一注册表

每个可运行 Agent 必须登记请求与响应 Schema、访问策略、总请求时限、同步上限、执行模式、能力/工作流/Prompt/规则/模型版本及工作流工厂。新增第六个 Agent 时，只新增定义和工作流，不修改调用路由的分发判断。

## 公共端口

`app/lib/runtime-ports.ts` 统一定义可信业务访问上下文、公共 AI 能力、领域数据和工具执行端口。现有五个 Agent 的专用方法仍保留领域类型，但全部继承公共端口约束。业务动作的“建议”和“执行”严格分离；执行必须同时提供审批令牌和幂等键。

## 可靠性

- 依赖级超时不能突破注册表给出的总请求时间预算。
- 浏览器或网关取消会传递给 LangGraph 下游 HTTP 请求。
- 仅临时错误重试；配置、契约和权限错误不重试。
- 重试使用指数退避和随机抖动。
- 熔断状态存入 D1，在多实例间共享；本地 Demo 才使用内存降级。
- AG-002、AG-012 标记为 `async-capable`。生产请求携带 `Prefer: respond-async` 时写入 D1 任务表并进入 Queue，返回 `202` 和任务地址。
- 回调使用 `source + callback_id + payload_hash` 去重；同一 ID 携带不同内容会拒绝。

## 可观测性与客户展示分离

生产响应只返回 `processing_steps`，不返回包含 Provider、规则判断和内部细节的 `trace`。完整内部 Trace 仅进入受控审计表。

每次运行记录 Agent、租户、状态、总耗时、能力/工作流/Prompt/规则/模型版本、各依赖耗时、尝试和重试次数。Token 与模型成本字段已经预留；在甲方 AI 中台回传标准 usage 之前保持为空，不用估算值冒充正式数据。

## 独立部署接口

- `GET /health/live`：进程存活；
- `GET /health/ready`：D1、运行模式和生产 Provider 就绪；
- `GET /v1/agents`：运行时注册信息；
- `POST /v1/agents/:agentId/invoke`：同步或异步调用；
- `GET /v1/tasks/:taskId`：按租户和用户查询任务；
- `POST /v1/callbacks/:source`：签名回调去重入口。

`wrangler.agent-runtime.toml.example` 只是部署样例。甲方采用私有云、政务云或本地 Kubernetes 时，应将 D1/Queue 端口替换为其数据库与消息队列实现，注册表、工作流和业务端口契约不变。

## 上线顺序

1. 执行 `db/migrations/0001_agent_runtime_state.sql` 和 `0002_commercial_runtime_p1.sql`。
2. 创建任务队列及死信队列，配置独立 Runtime 的 `DB`、`AGENT_TASKS` 绑定。
3. 注入网关签名密钥、AI 中台和业务数据适配器密钥。
4. 将五个 Provider 全部设为 `production`，通过 `/health/ready` 后再接流量。
5. 用甲方正式角色、租户、超时、限流和故障场景完成联调；Demo 数据不得作为验收数据。
