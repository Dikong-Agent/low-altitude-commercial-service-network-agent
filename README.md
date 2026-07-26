# 景德镇低空商业服务网 Agent 能力展厅 v1.1

面向甲方展示五个标杆业务 Agent 的前端能力展厅与统一演示工作台。

## 当前包含

- AG-001 低空产品型号对比Agent
- AG-002 低空产品说明书解读Agent
- AG-003 低空产品分类导购及推荐Agent
- AG-012 政策、标准解读Agent
- AG-025 智能客服Agent

页面当前明确使用样例知识与演示数据，不代表正式业务数据、正式联调结果或生产验收结论。

## AG-001 当前可运行能力

- 使用 LangGraphJS 编排需求理解、产品检索、参数归一、约束判断、比较分析和结果校验。
- 支持指定型号比较，也可按用途、预算、续航、载荷、抗风、交付及质保条件筛选样例产品。
- 输出横向参数表、候选评分、优势、短板、场景适配、条件冲突、首选和备选方案。
- 当输入信息不足时发起追问；当全部候选违反硬约束时拒绝强行推荐。
- 所有产品均为虚构 Mock 数据，通过 `BusinessDataPort` 提供，正式接入时替换数据适配器。

## 接口预留

- `GET /api/agents`：Agent目录。
- `POST /api/agents/:agentId/invoke`：统一Agent调用接口，采用`AgentInvokeRequest`和`AgentInvokeResponse`契约。
- `GET /api/data/products`：AG-001 Mock产品数据接口，可按`ids`或`scenario`查询。
- `GET /api/data/:resource`：其他业务数据适配接口占位，未来对接`BusinessDataPort`。
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

运行自动化回归：

```bash
pnpm run test
```
