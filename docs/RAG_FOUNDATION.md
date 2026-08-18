# 公共RAG底座运行说明

版本：v1.4  
日期：2026-08-13

## 当前实现

公共底座位于`app/lib/rag/`，已经实现：

- Zod运行时契约：知识对象、查询计划、访问范围、证据和逐声明引用结果；
- 标题/自然段切片、内容哈希、批量Embedding和预切片入库；
- 进程级共享运行时、命名空间去重、不可变索引版本、文档版本替换、索引回滚及历史版本数量上限；
- BM25关键词召回、向量余弦召回、精确词加权和RRF融合，并统一设置向量分数0.2、词法查询词覆盖率0.3及重排分数0.12的最低相关性门槛；
- 租户、角色、状态、知识域、生效时间及业务元数据前置过滤；
- 独立重排端口、本地确定性重排、标准HTTP重排适配器及DashScope `gte-rerank-v2`真实语义重排适配器；
- DeepSeek、Qwen及其他OpenAI兼容服务的服务端模型适配器；
- 独立OpenAI兼容Embedding适配器；
- 证据充分性门控、无证据停止生成、逐声明引用存在性及内容支撑度校验、高风险复核标记；
- 四个样例Agent的差异化检索参数；
- `knowledge/catalog.json`统一登记15项治理知识档案（1项国务院官网公开法规摘录、14项虚构演示材料），并通过运行记录映射确保知识清单、RAG入库和页面引用一致；
- 证据结果携带知识编号、来源单位、来源性质、文档类型、版本、生效信息、生命周期、原文定位和各阶段检索评分；
- AG-001、AG-012、AG-025、AG-027四个样例Agent的公共底座接入，结果返回不含密钥的`rag_runtime`诊断元数据及完整声明—证据映射；
- RAG健康检查、受保护的租户级知识入库和统一检索问答接口。
- ACL、时效、领域及元数据参与索引变更指纹；namespace作为强制检索隔离边界；
- Embedding或重排不可用时自动降级到词法/融合检索，大模型不可用时降级到证据输出；
- D1绑定下的namespace快照持久化、重启恢复、增量更新、文档/namespace删除、Embedding版本迁移、并发发布串行化及容量门禁；
- 阶段耗时、降级状态、模型Token用量和聚合运行指标；不记录用户问题、知识正文、密钥或供应商响应原文。

`local`模式使用进程内不可变索引、真实BM25和本地确定性重排，不伪造向量；当`MODEL_PROVIDER=disabled`时不调用大模型，当单独配置DeepSeek或Qwen时可形成“本地证据检索 + 远端受约束生成”。它用于研发回归和临时演示，进程重启后需要重新入库。`remote`模式要求独立配置生成模型和Embedding服务，适合接入完整的临时服务或后续甲方AI中台适配器。

## 运行模式

无外部服务的证据检索模式：

```text
RAG_RUNTIME_MODE=local
MODEL_PROVIDER=disabled
EMBEDDING_PROVIDER=disabled
RERANK_PROVIDER=local
RAG_MAX_INDEX_VERSIONS=20
```

DeepSeek生成、独立Embedding的临时研发模式：

```text
RAG_RUNTIME_MODE=remote
MODEL_PROVIDER=deepseek
MODEL_BASE_URL=https://api.deepseek.com
MODEL_API_KEY=仅在服务端设置
MODEL_NAME=deepseek-chat

EMBEDDING_PROVIDER=openai-compatible
EMBEDDING_BASE_URL=Embedding服务的OpenAI兼容地址
EMBEDDING_API_KEY=仅在服务端设置
EMBEDDING_MODEL=部署方确认的Embedding模型

RERANK_PROVIDER=http
RERANK_BASE_URL=重排服务地址
RERANK_API_KEY=仅在服务端设置
RERANK_MODEL=部署方确认的重排模型
```

当前DashScope语义重排配置：

```text
RERANK_PROVIDER=qwen
RERANK_BASE_URL=https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank
RERANK_MODEL=gte-rerank-v2
# RERANK_API_KEY可单独设置；留空时服务端复用EMBEDDING_API_KEY
```

仅接入DeepSeek生成、本地BM25检索时保持`RAG_RUNTIME_MODE=local`、`EMBEDDING_PROVIDER=disabled`，并配置DeepSeek四项模型参数。该模式有真实大模型生成，但没有向量召回，不能对外表述为完整语义RAG或甲方AI中台联调完成。

Qwen生成时将`MODEL_PROVIDER`设为`qwen`；未显式设置`MODEL_BASE_URL`时使用DashScope兼容模式默认地址。模型名、Embedding和重排服务能力必须以当前开通账号为准，不能假设聊天模型同时提供Embedding或重排。

Qwen Embedding向量检索配置：

```text
EMBEDDING_PROVIDER=qwen
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_API_KEY=仅在服务端设置的独立DashScope Key
EMBEDDING_MODEL=text-embedding-v4
EMBEDDING_TIMEOUT_MS=15000
EMBEDDING_MAX_BATCH=10
```

`EMBEDDING_BASE_URL`可留空，由`qwen`供应商配置补齐DashScope兼容地址。Embedding与DeepSeek生成使用不同服务和独立密钥；向量在服务端生成并写入当前进程索引，查询时对问题生成同模型向量，再与BM25结果按Agent画像进行RRF或加权融合。

所有密钥只允许写入服务端环境变量，不得放入浏览器公开变量、前端代码、日志、Trace或交付样例。

## 运行接口

- `GET /api/rag/health`：返回模式、能力开关、供应商名称和当前索引摘要，不返回URL、密钥或请求内容。`ready`仅表示配置和本地运行时可用，不等同于远端供应商已通过在线探测；
- `POST /api/rag/knowledge`：按租户和命名空间增量更新或全量替换知识；`mode`为`upsert`或`replace`。Demo模式需要至少24位的`JDZ_DEMO_RAG_ADMIN_TOKEN`并通过`x-demo-rag-admin-token`提交；生产模式只接受可信网关签名的`admin`或`knowledge-admin`身份；
- `DELETE /api/rag/knowledge?namespace=...&document_id=...`：删除指定文档；不传`document_id`时删除整个namespace；
- `POST /api/rag/query`：必须提供`namespace`，按四个样例Agent的检索画像执行隔离、ACL过滤、召回、重排、证据门控和可选生成。

知识入库接口限制单次请求不超过2 MB、50份文档，并校验所有文档租户必须与可信身份一致。Demo管理令牌只用于本地研发，不替代生产身份认证。

## 最小代码入口

```ts
import { createDefaultQueryPlan, createRagKernel, getRagAgentProfile } from "./app/lib/rag/index.ts";

const profile = getRagAgentProfile("AG-001");
const rag = createRagKernel();
await rag.ingestDocument({
  documentId: "manual-001", documentVersion: "v1", sourceType: "manual", sourceUri: "knowledge://manual-001",
  title: "产品说明书", content: "已经完成授权和解析的说明书正文", tenantId: "tenant-a",
  visibilityRoles: ["agent-user"], status: "active", domainTags: ["product-manual"],
  entityIds: ["product-001"], riskTags: ["safety"], metadata: {},
});
const query = "返航前应检查什么？";
const result = await rag.answer({
  query,
  plan: createDefaultQueryPlan({ agentId: "AG-001", query, knowledgeDomains: profile.knowledgeDomains }),
  access: { tenantId: "tenant-a", roles: ["agent-user"] },
  ...profile.retrieval,
});
```

说明书页码、政策条款等已经由OCR或版面解析得到的内容，应使用`ingestChunks`写入，保留`sectionPath`、`locator`和原始`sourceUri`，不要再次按纯文本切片。

## 远端协议

- 生成模型：`POST {MODEL_BASE_URL}/chat/completions`，兼容OpenAI Chat Completions JSON结构；
- Embedding：`POST {EMBEDDING_BASE_URL}/embeddings`，响应包含带`index`和`embedding`的`data`；
- 重排：`POST {RERANK_BASE_URL}/rerank`，请求包含`model/query/documents/top_n`，响应包含`results[index,relevance_score]`。

若甲方AI中台协议不同，只新增适配器，不修改Agent工作流、知识对象和结果契约。

## 验证

```bash
pnpm run test:rag
pnpm run eval:rag
pnpm run typecheck
```

在本机`.env.local`配置DeepSeek与DashScope密钥后，可执行`pnpm run verify:deepseek`，它会分别调用四个样例Agent，并校验DeepSeek生成、Qwen向量、Qwen语义重排、向量证据、逐声明引用覆盖、内容支撑度、声明—证据映射和Token计量。Agent结果中的证据计数是诊断计数，不代表证据质量评分。该命令会产生真实调用及相应费用，不属于离线回归测试。

配置独立Embedding密钥后执行`pnpm run verify:embedding`。验收脚本会在线生成查询与文档向量，校验向量维度和有限数值，验证语义相关文本的余弦相似度高于无关文本，并通过完整索引链路证明在无关键词重合时仍能以向量分数召回正确文档。该命令会产生真实Embedding调用及相应费用。

执行`pnpm run verify:rag-safety`可用虚构材料在线验证知识提示注入防护和无关问题拒答。离线测试覆盖索引发布与回滚、ACL变更、namespace隔离、低相关拒答、向量维度/版本治理、故障降级、持久化恢复、增量/删除、并发发布、容量门禁、非法或不忠实引用拦截、四Agent配置、健康检查、入库鉴权和端到端查询。`eval:rag`输出Recall@3、MRR@3、NDCG@3及并发性能。

## 当前边界

- 当前本机研发环境已完成四个样例Agent的DeepSeek生成、Qwen `text-embedding-v4`向量服务与`gte-rerank-v2`语义重排研发抽样；结果不替代甲方正式验收，密钥仅保存在被Git忽略的`.env.local`，不属于交付物；
- 该验收只证明我方临时研发链路可用，不代表甲方AI中台接口、账号、网络、安全策略或生产部署已经联调验收；
- 无D1绑定时仍使用进程内索引；有D1绑定时可持久化研发/轻量部署快照。正式大规模环境仍应实现同一`HybridSearchPort`，对接甲方持久化全文与向量检索服务；
- 当前内容支撑度采用确定性文本与关键值校验，可拦截明显错引；复杂推理仍需专项忠实度评测、独立验证模型或人工抽检；
- 真实材料进入公网模型前必须完成授权、分级和脱敏；订单、个人信息、合同及未公开材料不得默认外发；
- Agent只输出解释、建议、证据和复核事项，不执行发布、交易、审批、处罚或状态变更。
