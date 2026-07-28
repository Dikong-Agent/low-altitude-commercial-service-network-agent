# 生产适配器协议

本协议是业务智能体层与甲方 AI 中台、数据中台及业务系统之间的稳定内部分界。正式上游接口尚未确定时，Agent 工作流只依赖本协议；联调阶段通过网关映射上游实际接口，不把未确认字段写死到工作流中。

## 传输与身份

- 仅允许 HTTPS；本机联调可使用 `http://localhost` 或 `http://127.0.0.1`。
- 服务端使用 Bearer Token 调用，不向浏览器暴露密钥。
- Agent 服务自动传递经过可信网关验签的 `X-JDZ-Tenant-Id`、`X-JDZ-Subject-Id`、`X-JDZ-Roles` 和 `X-JDZ-Purpose: agent-invocation`。
- 上游必须再次执行租户级数据过滤，不能只依赖前端传入的业务编号。

## 版本与消息格式

当前契约版本为 `2026-07-27`。请求和响应均使用：

```json
{
  "contract_version": "2026-07-27",
  "meta": {
    "tenant_id": "TENANT-001",
    "classification": "internal",
    "source_ids": ["SOURCE-001"],
    "generated_at": "2026-07-27T00:00:00.000Z"
  },
  "data": {}
}
```

响应必须为 HTTP 2xx、合法 JSON、完全匹配操作对应的 Zod 数据契约，并回传与请求一致的租户、数据分级、来源标识和生成时间。业务数据响应的 `source_ids` 不得为空；`restricted` 数据只允许具有 `restricted-data-reader` 角色的主体访问。超时、超限、非 2xx、非法 JSON、版本错误、租户不一致、来源缺失或字段错误都会被视为依赖不可用，不进入后续业务节点。

## 路由

统一路由为：

`POST /v1/agent-ports/{agent-id}/{port}/{operation}`

`port` 为 `ai-platform` 或 `business-data`。五个 Agent 当前操作如下：

- AG-001：`understand-comparison-request`、`list-products`、`get-products`
- AG-002：`understand-manual-request`、`parse-manual-document`、`retrieve-manual-evidence`、`list-documents`、`get-document`
- AG-003：`understand-recommendation-request`、`list-products`、`list-scenario-solutions`
- AG-012：`understand-policy-request`、`retrieve-policy-evidence`、`search-documents`、`get-documents`、`get-version-chains`
- AG-025：`understand-customer-request`、`rank-customer-knowledge`、`search-knowledge`、`get-orders`、`find-products`、`get-service-guides`。会话状态由 Agent 服务的 D1 持久化层承载，不委托给业务数据适配器。

操作的准确输入与输出类型以 `app/lib/production-adapters.ts` 及各 Agent `types.ts` 中的 Zod Schema 为准。

## 生产启用条件

生产运行时必须同时满足：

- `AGENT_RUNTIME_MODE=production`
- 对应 Agent 的 `AGxxx_PROVIDER=production`
- AI 中台和业务数据服务的 Base URL、鉴权 Token 已配置
- 请求来自可信网关并具有有效租户身份

任一条件不满足时，系统返回 503，不允许回退到 Mock 数据。

AI 中台还必须识别 `X-JDZ-Untrusted-Content: true` 与 `X-JDZ-Safety-Policy`，将请求正文视为不可信业务数据，不允许其中内容覆盖系统指令、工具白名单、租户权限或输出约束。
