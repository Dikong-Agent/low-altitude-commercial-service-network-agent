# 景德镇低空商业服务网 Agent 能力展厅

面向甲方展示五个标杆业务 Agent 的前端能力展厅与统一演示工作台。

## 当前包含

- AG-001 低空产品型号对比Agent
- AG-002 低空产品说明书解读Agent
- AG-003 低空产品分类导购及推荐Agent
- AG-012 政策、标准解读Agent
- AG-025 智能客服Agent

页面当前明确使用样例知识与演示数据，不代表正式业务数据、正式联调结果或生产验收结论。

## 接口预留

- `GET /api/agents`：Agent目录。
- `POST /api/agents/:agentId/invoke`：统一Agent调用接口，采用`AgentInvokeRequest`和`AgentInvokeResponse`契约。
- `GET /api/data/:resource`：业务数据适配接口占位，未来对接`BusinessDataPort`。
- `NEXT_PUBLIC_AGENT_API_BASE`：外部Agent服务地址。
- `NEXT_PUBLIC_DATA_API_BASE`：外部业务数据服务地址。

## 本地运行

```bash
pnpm install
pnpm run dev
```

生产构建：

```bash
pnpm run build
```
