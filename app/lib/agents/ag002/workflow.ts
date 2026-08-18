import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";
import {
  AgentInvokeRequestSchema,
  AgentInvokeResponseSchema,
  AgentManualOutputSchema,
  type AgentInvokeRequest,
  type AgentInvokeResponse,
  type AgentManualOutput,
} from "../../contracts";
import { executeWithPolicy } from "../../reliability";
import type { RequestIdentity } from "../../request-identity";
import { AG002_CONFIG } from "./config";
import { buildManualOutput } from "./engine";
import { getAg002ProviderRevision, resolveAg002Dependencies, type Ag002Dependencies } from "./providers";
import {
  ManualDocumentSourceSchema,
  ManualIntentSchema,
  ParsedManualSchema,
  RankedManualSectionSchema,
} from "./types";

const TraceStepSchema = z.object({ name: z.string(), detail: z.string() });

const Ag002GraphState = new StateSchema({
  request: AgentInvokeRequestSchema,
  traceId: z.string(),
  intent: ManualIntentSchema.optional(),
  manualSource: ManualDocumentSourceSchema.optional(),
  documentMissing: z.boolean().optional(),
  parsedManual: ParsedManualSchema.optional(),
  rankedSections: z.array(RankedManualSectionSchema).optional(),
  manualOutput: AgentManualOutputSchema.optional(),
  response: AgentInvokeResponseSchema.optional(),
  trace: z.array(TraceStepSchema).optional(),
});

function appendTrace(state: { trace?: Array<{ name: string; detail: string }> }, name: string, detail: string) {
  return [...(state.trace ?? []), { name, detail }];
}

function responseTitle(manual: AgentManualOutput): string {
  if (manual.intent.topics.includes("troubleshooting")) return "说明书故障排查指引";
  if (manual.intent.topics.includes("operation") || manual.intent.topics.includes("safety")) return "说明书安全操作指引";
  if (manual.intent.topics.includes("terminology")) return "说明书术语通俗解读";
  if (manual.intent.topics.includes("compliance")) return "说明书合规要点解读";
  return "说明书核心内容摘要";
}

function requiresHumanReview(manual: AgentManualOutput): boolean {
  return manual.intent.topics.some((topic) => ["operation", "safety", "troubleshooting", "compliance"].includes(topic));
}

export function createAg002Workflow(dependencies: Ag002Dependencies) {
  const understandRequest = async (state: typeof Ag002GraphState.State) => {
    const intent = await executeWithPolicy(
      "ag002.ai-platform-understanding",
      AG002_CONFIG.reliability.aiPlatform,
      (signal) => dependencies.aiPlatform.understandManualRequest(state.request, { signal }),
    );
    const detail = intent.needsClarification
      ? "没有识别到可执行的说明书问题。"
      : `识别到${intent.topics.length}类问题${intent.scenarios.length ? `，场景：${intent.scenarios.join("、")}` : ""}。`;
    return { intent, trace: appendTrace(state, "识别问题类型", detail) };
  };

  const buildClarification = (state: typeof Ag002GraphState.State) => {
    const message = state.intent?.clarificationMessage ?? "请补充需要解读的说明书问题。";
    const response: AgentInvokeResponse = {
      request_id: `AG002-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-002",
      status: "needs_clarification",
      environment: dependencies.environment,
      output: {
        title: "需要补充说明书问题",
        summary: message,
        points: ["可以询问飞行前安全检查或充电步骤。", "也可以询问定位漂移排查、专业术语或合规要求。"],
        evidence: ["AG-002 输入完整性规则 v1.0"],
      },
      trace: appendTrace(state, "请求补充信息", "工作流未检索文档，避免生成脱离手册依据的答复。"),
    };
    return { response, trace: response.trace };
  };

  const loadDocument = async (state: typeof Ag002GraphState.State) => {
    const manualSource = await executeWithPolicy(
      "ag002.document-data",
      AG002_CONFIG.reliability.documentData,
      (signal) => dependencies.documentData.getDocument(state.intent!.manualId, { signal }),
    );
    return {
      manualSource: manualSource ?? undefined,
      documentMissing: !manualSource,
      trace: appendTrace(state, "加载样例说明书", manualSource
        ? `通过 ${dependencies.providerName} DocumentDataPort 加载${manualSource.title}。`
        : `未找到文档 ${state.intent!.manualId}。`),
    };
  };

  const buildMissingDocument = (state: typeof Ag002GraphState.State) => {
    const response: AgentInvokeResponse = {
      request_id: `AG002-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-002",
      status: "needs_clarification",
      environment: dependencies.environment,
      output: {
        title: "未找到指定说明书",
        summary: "当前演示环境没有找到指定文档，请改用预置样例说明书。",
        points: [`当前可用文档：${AG002_CONFIG.defaultManualId}`, "正式文档上传与文档库接口将在三方接口确认后接入。"],
        evidence: ["AG-002 演示文档目录"],
      },
      trace: appendTrace(state, "请求选择文档", "文档不存在，工作流在解析前安全停止。"),
    };
    return { response, trace: response.trace };
  };

  const parseDocument = async (state: typeof Ag002GraphState.State) => {
    const parsedManual = await executeWithPolicy(
      "ag002.ai-platform-document-parse",
      AG002_CONFIG.reliability.aiPlatform,
      (signal) => dependencies.aiPlatform.parseManualDocument(state.manualSource!, { signal }),
    );
    return {
      parsedManual,
      trace: appendTrace(state, "解析文档结构", `识别${parsedManual.structure.chapters}个章节、${parsedManual.structure.figures}个图示；当前使用预解析演示文档。`),
    };
  };

  const retrieveEvidence = async (state: typeof Ag002GraphState.State) => {
    const rankedSections = await executeWithPolicy(
      "ag002.ai-platform-retrieval",
      AG002_CONFIG.reliability.ragGeneration,
      (signal) => dependencies.aiPlatform.retrieveManualEvidence(state.parsedManual!, state.intent!, state.request.input, { signal }),
    );
    return {
      rankedSections,
      trace: appendTrace(state, "定位相关章节", rankedSections.length
        ? `${dependencies.providerName === "demo" ? "按样例标签和规则" : "按问题含义"}检索并整理${rankedSections.length}个相关章节，保留页码和章节定位。`
        : "没有检索到与问题直接相关且可引用的说明书章节。"),
    };
  };

  const buildNoEvidence = (state: typeof Ag002GraphState.State) => {
    const response: AgentInvokeResponse = {
      request_id: `AG002-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-002",
      status: "needs_clarification",
      environment: dependencies.environment,
      output: {
        title: "说明书中未找到可靠依据",
        summary: "当前样例说明书中没有找到与该问题直接相关的内容，请换一种描述或选择已收录的说明书场景。",
        points: ["可以询问飞行前检查、充电、维护或定位漂移。", "也可以询问 GNSS、RTH、返航点、IMU 或失控保护等术语。"],
        evidence: ["AG-002 证据充分性规则 v1.1"],
      },
      trace: appendTrace(state, "请求补充信息", "证据门控未通过，工作流未生成操作性答复。"),
    };
    return { response, trace: response.trace };
  };

  const composeGuidance = (state: typeof Ag002GraphState.State) => {
    const manualOutput = buildManualOutput(state.parsedManual!, state.intent!, state.rankedSections ?? [], dependencies.engine);
    return {
      manualOutput,
      trace: appendTrace(state, "整理答复与操作说明", `整理${manualOutput.steps.length}个步骤、${manualOutput.glossary.length}条术语解释和${manualOutput.citations.length}处原文位置。`),
    };
  };

  const reviewSafety = (state: typeof Ag002GraphState.State) => ({
    trace: appendTrace(state, "核验风险与依据", `标注${state.manualOutput?.risk_markers.length ?? 0}条安全、禁忌或合规提示；高风险操作保留人工复核。`),
  });

  const buildResponse = (state: typeof Ag002GraphState.State) => {
    const manual = state.manualOutput!;
    const reviewRequired = requiresHumanReview(manual);
    const pointSource = manual.steps.length
      ? manual.steps.slice(0, 3).map((step) => `${step.order}. ${step.title}：${step.instruction}`)
      : manual.glossary.length
        ? manual.glossary.slice(0, 3).map((item) => `${item.term}：${item.plain_explanation}`)
        : [manual.answer];
    const response: AgentInvokeResponse = {
      request_id: `AG002-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      trace_id: state.traceId,
      agent_id: "AG-002",
      status: reviewRequired ? "needs_review" : "completed",
      environment: dependencies.environment,
      output: {
        title: responseTitle(manual),
        summary: `${manual.answer}${reviewRequired ? " 涉及操作、安全或合规判断，请在执行前核对真实有效手册并由专业人员确认。" : ""}`,
        points: pointSource,
        evidence: [...new Set(manual.citations.map((citation) => `${manual.document.version} · ${citation.location}`)), manual.rule_version],
        manual,
      },
      trace: appendTrace(state, "输出带依据解读", reviewRequired ? "已输出完整指引并标记人工复核边界。" : "已输出带章节定位的说明书解读。"),
    };
    return { response, trace: response.trace };
  };

  return new StateGraph(Ag002GraphState)
    .addNode("understand_request", understandRequest)
    .addNode("clarify", buildClarification)
    .addNode("load_document", loadDocument)
    .addNode("missing_document", buildMissingDocument)
    .addNode("parse_document", parseDocument)
    .addNode("retrieve_evidence", retrieveEvidence)
    .addNode("no_evidence", buildNoEvidence)
    .addNode("compose_guidance", composeGuidance)
    .addNode("review_safety", reviewSafety)
    .addNode("build_response", buildResponse)
    .addEdge(START, "understand_request")
    .addConditionalEdges("understand_request", (state) => state.intent?.needsClarification ? "clarify" : "load_document")
    .addEdge("clarify", END)
    .addConditionalEdges("load_document", (state) => state.documentMissing ? "missing_document" : "parse_document")
    .addEdge("missing_document", END)
    .addEdge("parse_document", "retrieve_evidence")
    .addConditionalEdges("retrieve_evidence", (state) => state.rankedSections?.length ? "compose_guidance" : "no_evidence")
    .addEdge("no_evidence", END)
    .addEdge("compose_guidance", "review_safety")
    .addEdge("review_safety", "build_response")
    .addEdge("build_response", END)
    .compile();
}

let cachedWorkflow: { providerName: string; revision: number; workflow: ReturnType<typeof createAg002Workflow> } | undefined;

function getDefaultWorkflow(identity?: RequestIdentity) {
  const providerName = process.env.AG002_PROVIDER ?? "demo";
  if (providerName === "production") return createAg002Workflow(resolveAg002Dependencies(providerName, identity));
  const revision = getAg002ProviderRevision();
  if (!cachedWorkflow || cachedWorkflow.providerName !== providerName || cachedWorkflow.revision !== revision) {
    cachedWorkflow = { providerName, revision, workflow: createAg002Workflow(resolveAg002Dependencies(providerName)) };
  }
  return cachedWorkflow.workflow;
}

export async function invokeAg002(request: AgentInvokeRequest, traceId: string, identity?: RequestIdentity): Promise<AgentInvokeResponse> {
  const result = await getDefaultWorkflow(identity).invoke({ request, traceId, trace: [] });
  if (!result.response) throw new Error("AG-002 workflow completed without a response");
  return AgentInvokeResponseSchema.parse(result.response);
}
