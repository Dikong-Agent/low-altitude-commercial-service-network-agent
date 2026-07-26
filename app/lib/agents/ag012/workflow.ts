import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";
import {
  Ag012InvokeRequestSchema,
  AgentInvokeResponseSchema,
  AgentPolicyOutputSchema,
  type Ag012InvokeRequest,
  type AgentInvokeResponse,
  type AgentPolicyOutput,
} from "../../contracts";
import { executeWithPolicy } from "../../reliability";
import { AG012_CONFIG } from "./config";
import { buildPolicyOutput, effectiveStatus } from "./engine";
import { getAg012ProviderRevision, resolveAg012Dependencies, type Ag012Dependencies } from "./providers";
import { DemoPolicyDocumentSchema, PolicyIntentSchema, RankedPolicyEvidenceSchema } from "./types";

const TraceStepSchema = z.object({ name: z.string(), detail: z.string() });

const Ag012GraphState = new StateSchema({
  request: Ag012InvokeRequestSchema,
  traceId: z.string(),
  intent: PolicyIntentSchema.optional(),
  documents: z.array(DemoPolicyDocumentSchema).optional(),
  documentsMissing: z.boolean().optional(),
  versionComparisonIssue: z.string().nullable().optional(),
  rankedEvidence: z.array(RankedPolicyEvidenceSchema).optional(),
  policyOutput: AgentPolicyOutputSchema.optional(),
  response: AgentInvokeResponseSchema.optional(),
  trace: z.array(TraceStepSchema).optional(),
});

function appendTrace(state: { trace?: Array<{ name: string; detail: string }> }, name: string, detail: string) {
  return [...(state.trace ?? []), { name, detail }];
}

function responseTitle(policy: AgentPolicyOutput): string {
  if (policy.mode === "version_compare") return "政策版本变化解读";
  if (policy.mode === "applicability") return "政策适用条件辅助判断";
  if (policy.mode === "business_impact") return "政策变化业务影响分析";
  if (policy.mode === "policy_summary") return "政策与标准要点摘要";
  return "政策与标准依据解读";
}

export function createAg012Workflow(dependencies: Ag012Dependencies) {
  const understandRequest = async (state: typeof Ag012GraphState.State) => {
    const intent = await executeWithPolicy(
      "ag012.ai-platform-understanding",
      AG012_CONFIG.reliability.aiPlatform,
      (signal) => dependencies.aiPlatform.understandPolicyRequest(state.request, { signal }),
    );
    return {
      intent,
      trace: appendTrace(state, "理解政策问题", intent.needsClarification
        ? "没有识别到可执行的政策、标准或适航问题。"
        : `识别为${intent.mode}，时点为${intent.asOfDate}${intent.scenarios.length ? `，场景：${intent.scenarios.join("、")}` : ""}。`),
    };
  };

  const buildClarification = (state: typeof Ag012GraphState.State) => {
    const response: AgentInvokeResponse = {
      request_id: `AG012-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-012",
      status: "needs_clarification",
      environment: dependencies.environment,
      output: {
        title: "需要补充政策问题",
        summary: state.intent?.clarificationMessage ?? "请补充政策、标准或适航问题。",
        points: ["可以概括当前有效政策的核心要求。", "可以比较新旧政策在报备、适用范围和记录期限方面的变化。", "也可以说明企业场景，并询问可能适用的条件。"],
        evidence: ["AG-012 输入完整性规则 v1.0"],
      },
      trace: appendTrace(state, "请求补充信息", "工作流未检索材料，避免生成脱离政策依据的答复。"),
    };
    return { response, trace: response.trace };
  };

  const buildAirworthinessBoundary = (state: typeof Ag012GraphState.State) => {
    const response: AgentInvokeResponse = {
      request_id: `AG012-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-012",
      status: "needs_review",
      environment: dependencies.environment,
      output: {
        title: "适航资料接口待接入",
        summary: "当前演示环境没有接入权威适航资料，不能形成适航要求、案例适用性或合规结论。",
        points: ["已保留适航材料检索、来源时效核验和条款引用接口。", "适航解读需以权威现行资料为依据。", "涉及安全与监管责任的结论必须由专业人员最终确认。"],
        evidence: ["AG-012 AIPlatformPort 适航检索边界", "AG-012 PolicyDataPort 权威资料边界"],
      },
      trace: appendTrace(state, "保留适航复核边界", "未伪造适航知识或合规判断，等待权威资料与专业复核机制接入。"),
    };
    return { response, trace: response.trace };
  };

  const loadDocuments = async (state: typeof Ag012GraphState.State) => {
    const intent = state.intent!;
    let documents = await executeWithPolicy(
      "ag012.policy-data-search",
      AG012_CONFIG.reliability.policyData,
      (signal) => intent.requestedDocumentIds.length
        ? dependencies.policyData.getDocuments(intent.requestedDocumentIds, { signal })
        : dependencies.policyData.searchDocuments({ documentTypes: intent.documentTypes, query: state.request.input, limit: 20 }, { signal }),
    );
    let versionComparisonIssue: string | null = null;
    if (intent.mode === "version_compare") {
      const chainIds = new Set(documents.map((document) => document.versionChainId));
      if (chainIds.size !== 1) {
        versionComparisonIssue = chainIds.size === 0
          ? "未找到可比较的政策或标准版本链。"
          : "当前问题命中了多个不同版本链，请明确只比较一项政策或标准。";
      } else {
        documents = await executeWithPolicy(
          "ag012.policy-data-version-chain",
          AG012_CONFIG.reliability.policyData,
          (signal) => dependencies.policyData.getVersionChains([...chainIds], { signal }),
        );
        if (documents.length < 2) versionComparisonIssue = "当前资料库只收录了一个版本，暂时无法进行新旧版本比较。";
      }
    }
    return {
      documents,
      documentsMissing: documents.length === 0,
      versionComparisonIssue,
      trace: appendTrace(state, "加载样例政策库", documents.length
        ? `通过 ${dependencies.providerName} PolicyDataPort 加载${documents.length}份虚构样例政策或标准。`
        : "当前样例政策库中没有找到指定材料。"),
    };
  };

  const buildMissingDocuments = (state: typeof Ag012GraphState.State) => {
    const response: AgentInvokeResponse = {
      request_id: `AG012-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-012",
      status: "needs_clarification",
      environment: dependencies.environment,
      output: {
        title: "未找到指定政策材料",
        summary: "当前演示环境没有找到指定政策或标准，请改用预置样例材料。",
        points: ["可查询样例飞行活动管理办法。", "可查询样例低空物流运行安全规范。", "正式政策库与适航资料接口将在三方接口确认后接入。"],
        evidence: ["AG-012 Mock 政策目录"],
      },
      trace: appendTrace(state, "请求选择材料", "材料不存在，工作流在检索前安全停止。"),
    };
    return { response, trace: response.trace };
  };

  const buildVersionComparisonUnavailable = (state: typeof Ag012GraphState.State) => {
    const response: AgentInvokeResponse = {
      request_id: `AG012-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-012",
      status: "needs_clarification",
      environment: dependencies.environment,
      output: {
        title: "暂不具备可比较的版本链",
        summary: state.versionComparisonIssue ?? "请明确需要比较的政策或标准，并确认资料库已收录至少两个关联版本。",
        points: ["一次只比较同一政策或标准的关联版本。", "至少需要两个能够确认版本关系的材料。", "不会使用其他政策的版本变化替代当前问题。"],
        evidence: ["AG-012 版本链完整性规则 v1.1"],
      },
      trace: appendTrace(state, "请求确认比较对象", "版本链不唯一或版本数量不足，工作流未生成替代性比较结论。"),
    };
    return { response, trace: response.trace };
  };

  const resolveVersions = (state: typeof Ag012GraphState.State) => {
    const statuses = (state.documents ?? []).map((document) => `${document.version}:${effectiveStatus(document, state.intent!.asOfDate)}`);
    return { trace: appendTrace(state, "核验版本与时效", `截至${state.intent!.asOfDate}完成版本链核对：${statuses.join("，")}。`) };
  };

  const retrieveEvidence = async (state: typeof Ag012GraphState.State) => {
    const rankedEvidence = await executeWithPolicy(
      "ag012.ai-platform-retrieval",
      AG012_CONFIG.reliability.aiPlatform,
      (signal) => dependencies.aiPlatform.retrievePolicyEvidence(state.documents ?? [], state.intent!, state.request.input, { signal }),
    );
    return {
      rankedEvidence,
      trace: appendTrace(state, "检索并重排依据", rankedEvidence.length
        ? `检索并重排${rankedEvidence.length}个条款片段，保留文号、版本、条款和生效状态。`
        : "没有找到与问题直接相关且可引用的政策条款。"),
    };
  };

  const buildNoEvidence = (state: typeof Ag012GraphState.State) => {
    const response: AgentInvokeResponse = {
      request_id: `AG012-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-012",
      status: "needs_clarification",
      environment: dependencies.environment,
      output: {
        title: "样例材料中未找到可靠依据",
        summary: "当前样例政策与标准中没有找到能够直接支持该问题的条款，未生成推测性结论。",
        points: ["可以询问适用范围、活动报备、运行记录或物流运行安全。", "也可以比较2025试行版和2026修订稿。"],
        evidence: ["AG-012 证据充分性规则 v1.0"],
      },
      trace: appendTrace(state, "请求补充信息", "证据门控未通过，工作流未生成政策结论。"),
    };
    return { response, trace: response.trace };
  };

  const composeInterpretation = (state: typeof Ag012GraphState.State) => {
    const policyOutput = buildPolicyOutput(state.documents ?? [], state.intent!, state.rankedEvidence ?? [], dependencies.engine);
    return {
      policyOutput,
      trace: appendTrace(state, "生成带依据解读", `形成${policyOutput.key_points.length}项要点、${policyOutput.changes.length}项版本变化和${policyOutput.citations.length}处条款引用。`),
    };
  };

  const reviewBoundaries = (state: typeof Ag012GraphState.State) => ({
    trace: appendTrace(state, "核验适用与复核边界", state.policyOutput?.review_items.length
      ? `识别${state.policyOutput.review_items.length}项需核实事项，保留主管部门或专业人员复核。`
      : "已区分当前有效版本与待生效版本，未形成高风险适用结论。"),
  });

  const buildResponse = (state: typeof Ag012GraphState.State) => {
    const policy = state.policyOutput!;
    const response: AgentInvokeResponse = {
      request_id: `AG012-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-012",
      status: policy.review_items.length ? "needs_review" : "completed",
      environment: dependencies.environment,
      output: {
        title: responseTitle(policy),
        summary: `${policy.answer}${policy.review_items.length ? " 结果包含需核实事项，请勿直接作为真实业务执行依据。" : ""}`,
        points: policy.mode === "version_compare" && policy.changes.length
          ? policy.changes.slice(0, 4).map((change) => `${change.topic}：${change.explanation}`)
          : policy.key_points.slice(0, 4),
        evidence: [...new Set(policy.citations.slice(0, 5).map((citation) => `${citation.document_number} · ${citation.version} · ${citation.locator}`)), policy.rule_version],
        policy,
      },
      trace: appendTrace(state, "输出政策解读结果", policy.review_items.length ? "已输出带引用结果并标记人工复核边界。" : "已输出带版本、时效和条款定位的解读。"),
    };
    return { response, trace: response.trace };
  };

  return new StateGraph(Ag012GraphState)
    .addNode("understand_request", understandRequest)
    .addNode("clarify", buildClarification)
    .addNode("airworthiness_boundary", buildAirworthinessBoundary)
    .addNode("load_documents", loadDocuments)
    .addNode("missing_documents", buildMissingDocuments)
    .addNode("version_comparison_unavailable", buildVersionComparisonUnavailable)
    .addNode("resolve_versions", resolveVersions)
    .addNode("retrieve_evidence", retrieveEvidence)
    .addNode("no_evidence", buildNoEvidence)
    .addNode("compose_interpretation", composeInterpretation)
    .addNode("review_boundaries", reviewBoundaries)
    .addNode("build_response", buildResponse)
    .addEdge(START, "understand_request")
    .addConditionalEdges("understand_request", (state) => state.intent?.needsClarification ? "clarify" : state.intent?.mode === "airworthiness" ? "airworthiness_boundary" : "load_documents")
    .addEdge("clarify", END)
    .addEdge("airworthiness_boundary", END)
    .addConditionalEdges("load_documents", (state) => state.documentsMissing
      ? "missing_documents"
      : state.versionComparisonIssue
        ? "version_comparison_unavailable"
        : "resolve_versions")
    .addEdge("missing_documents", END)
    .addEdge("version_comparison_unavailable", END)
    .addEdge("resolve_versions", "retrieve_evidence")
    .addConditionalEdges("retrieve_evidence", (state) => state.rankedEvidence?.length ? "compose_interpretation" : "no_evidence")
    .addEdge("no_evidence", END)
    .addEdge("compose_interpretation", "review_boundaries")
    .addEdge("review_boundaries", "build_response")
    .addEdge("build_response", END)
    .compile();
}

let cachedWorkflow: { providerName: string; revision: number; workflow: ReturnType<typeof createAg012Workflow> } | undefined;

function getDefaultWorkflow() {
  const providerName = process.env.AG012_PROVIDER ?? "demo";
  const revision = getAg012ProviderRevision();
  if (!cachedWorkflow || cachedWorkflow.providerName !== providerName || cachedWorkflow.revision !== revision) {
    cachedWorkflow = { providerName, revision, workflow: createAg012Workflow(resolveAg012Dependencies(providerName)) };
  }
  return cachedWorkflow.workflow;
}

export async function invokeAg012(request: Ag012InvokeRequest, traceId: string): Promise<AgentInvokeResponse> {
  const result = await getDefaultWorkflow().invoke({ request, traceId, trace: [] });
  if (!result.response) throw new Error("AG-012 workflow completed without a response");
  return AgentInvokeResponseSchema.parse(result.response);
}
