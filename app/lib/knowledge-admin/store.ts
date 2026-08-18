import { chunkKnowledgeDocument } from "../rag/chunking.ts";
import type { KnowledgeDocument } from "../rag/contracts.ts";
import { FORMAL_KNOWLEDGE_CATALOG } from "../rag/formal-knowledge.ts";
import { getSharedRagRuntime } from "../rag/runtime.ts";
import { sha256 } from "../rag/text.ts";
import { getRuntimeBindings } from "../runtime-bindings.ts";
import type {
  KnowledgeAdminSnapshot, KnowledgeMetadata, KnowledgeRevision, ManagedKnowledgeDocument,
  ManagedAgentId, PublicationEvent, QaSample,
} from "./contracts.ts";

const TENANT_ID = "DEMO-TENANT";
const SNAPSHOT_ID = "knowledge-admin-v1";
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "json", "csv", "tsv"]);
const EXTERNAL_EXTENSIONS = new Set(["pdf", "doc", "docx", "png", "jpg", "jpeg", "webp", "tif", "tiff"]);

const qaQuestions: Record<ManagedAgentId, string> = {
  "AG-001": "山地巡检场景下，不同样例机型的续航与载荷差异是什么？",
  "AG-012": "现行样例政策对活动报备有哪些要求？",
  "AG-027": "退款率指标的正式口径、数据粒度和可分析维度是什么？",
  "AG-025": "用户申请售后时应准备哪些信息？",
};

function now(): string { return new Date().toISOString(); }
function uid(prefix: string): string { return `${prefix}-${crypto.randomUUID()}`; }
function extension(name: string): string { return name.split(".").at(-1)?.toLowerCase() ?? ""; }
function metadataOf(document: ManagedKnowledgeDocument): KnowledgeMetadata {
  const { agentId, title, documentType, domain, sourceOrganization, sourceNature, sourceUri, version, publishedAt, effectiveFrom, effectiveTo, confidentiality, visibilityRoles, reviewOwner } = document;
  return { agentId, title, documentType, domain, sourceOrganization, sourceNature, sourceUri, version, publishedAt, effectiveFrom, effectiveTo, confidentiality, visibilityRoles, reviewOwner };
}
function revisionOf(document: ManagedKnowledgeDocument, actor: string, reason: string): KnowledgeRevision {
  return { revisionId: uid("REV"), version: document.version, lifecycleStatus: document.lifecycleStatus, content: document.content, metadata: metadataOf(document), createdAt: now(), actor, reason };
}

function seedSnapshot(): KnowledgeAdminSnapshot {
  const createdAt = `${FORMAL_KNOWLEDGE_CATALOG.baseline_date}T00:00:00.000Z`;
  const documents: ManagedKnowledgeDocument[] = FORMAL_KNOWLEDGE_CATALOG.documents.map((item) => ({
    id: item.knowledge_id,
    agentId: item.agent_id as ManagedAgentId,
    title: item.title,
    documentType: item.document_type,
    domain: item.knowledge_domain,
    sourceOrganization: item.source_organization,
    sourceNature: item.source_nature,
    sourceUri: item.document_uri,
    version: item.version,
    publishedAt: item.published_at,
    effectiveFrom: item.effective_from,
    effectiveTo: item.effective_to,
    confidentiality: item.confidentiality,
    visibilityRoles: ["*"],
    reviewOwner: item.review_owner,
    lifecycleStatus: item.lifecycle_status,
    parseStatus: "parsed",
    fileName: item.document_uri.split("/").at(-1)?.split("#")[0] ?? `${item.knowledge_id}.md`,
    fileType: "text/markdown",
    content: `${item.title}\n\n本条目为项目自编虚构演示知识资产。正式环境须替换为经授权、已审核且处于有效状态的原始材料。`,
    checksum: `catalog:${FORMAL_KNOWLEDGE_CATALOG.catalog_version}:${item.knowledge_id}`,
    chunks: item.record_ids.map((recordId, index) => ({ chunkId: recordId, order: index + 1, characters: recordId.length, excerpt: `既有演示知识记录：${recordId}` })),
    createdAt, updatedAt: `${item.reviewed_at}T00:00:00.000Z`, revisions: [], seeded: true,
  }));
  const publications: PublicationEvent[] = documents.map((document) => ({
    id: uid("PUB"), documentId: document.id, agentId: document.agentId, action: "seed", version: document.version,
    actor: "项目演示知识维护组", createdAt, detail: "从正式样例知识目录登记基线状态，未重复写入运行索引。",
  }));
  const qaSamples: QaSample[] = (Object.keys(qaQuestions) as ManagedAgentId[]).map((agentId) => ({
    id: uid("QA"), agentId, question: qaQuestions[agentId],
    expectedKnowledgeIds: documents.filter((item) => item.agentId === agentId && item.lifecycleStatus === "published").map((item) => item.id),
    result: "pending", note: "待进行人工抽样复核。",
  }));
  return { schemaVersion: "1.0", documents, publications, qaSamples, updatedAt: createdAt };
}

type SnapshotRow = { snapshot_json: string };
let memory = seedSnapshot();
let mutationTail: Promise<void> = Promise.resolve();

async function hydrate(): Promise<void> {
  const db = getRuntimeBindings()?.DB;
  if (!db) return;
  const row = await db.prepare("SELECT snapshot_json FROM knowledge_admin_snapshots WHERE tenant_id = ? AND snapshot_id = ?")
    .bind(TENANT_ID, SNAPSHOT_ID).first<SnapshotRow>();
  if (row) memory = JSON.parse(row.snapshot_json) as KnowledgeAdminSnapshot;
}
async function persist(): Promise<void> {
  memory.updatedAt = now();
  const db = getRuntimeBindings()?.DB;
  if (!db) return;
  await db.prepare("INSERT INTO knowledge_admin_snapshots (tenant_id, snapshot_id, snapshot_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(tenant_id, snapshot_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at")
    .bind(TENANT_ID, SNAPSHOT_ID, JSON.stringify(memory), memory.updatedAt).run();
}
async function mutate<T>(operation: () => Promise<T>): Promise<T> {
  let release = () => {};
  const previous = mutationTail;
  mutationTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { await hydrate(); const result = await operation(); await persist(); return result; }
  finally { release(); }
}
function findDocument(id: string): ManagedKnowledgeDocument {
  const document = memory.documents.find((item) => item.id === id);
  if (!document) throw new KnowledgeAdminError("KNOWLEDGE_NOT_FOUND", 404, "未找到指定知识资产");
  return document;
}
function namespaceFor(agentId: ManagedAgentId): string { return `${TENANT_ID}-${agentId.toLowerCase()}-managed`.toLowerCase(); }
function runtimeDocument(document: ManagedKnowledgeDocument, lifecycleStatus = document.lifecycleStatus): KnowledgeDocument {
  return {
    documentId: document.id, documentVersion: document.version, sourceType: document.documentType,
    sourceUri: document.sourceUri ?? `knowledge-admin://${document.id}`, title: document.title, content: document.content,
    tenantId: TENANT_ID, visibilityRoles: document.visibilityRoles, status: "active",
    effectiveFrom: document.effectiveFrom ? `${document.effectiveFrom}T00:00:00.000Z` : undefined,
    effectiveTo: document.effectiveTo ? `${document.effectiveTo}T23:59:59.999Z` : undefined,
    domainTags: [document.domain], entityIds: [document.id], riskTags: document.domain.includes("policy") || document.domain.includes("standard") ? ["policy"] : [],
    metadata: { knowledge_id: document.id, source_organization: document.sourceOrganization, source_nature: document.sourceNature,
      confidentiality: document.confidentiality, lifecycle_status: lifecycleStatus, review_owner: document.reviewOwner },
  };
}

export class KnowledgeAdminError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) { super(message); this.code = code; this.status = status; this.name = "KnowledgeAdminError"; }
}

export async function getKnowledgeDashboard() {
  await hydrate();
  const current = new Date();
  const inThirtyDays = new Date(current.getTime() + 30 * 86_400_000);
  const expiryAlerts = memory.documents.filter((item) => item.effectiveTo && new Date(`${item.effectiveTo}T23:59:59Z`) <= inThirtyDays && item.lifecycleStatus !== "withdrawn")
    .map((item) => ({ documentId: item.id, title: item.title, effectiveTo: item.effectiveTo, severity: new Date(`${item.effectiveTo}T23:59:59Z`) < current ? "expired" : "expiring" }));
  const health = getSharedRagRuntime().health();
  return {
    documents: memory.documents, publications: memory.publications.slice(-50).reverse(), qaSamples: memory.qaSamples,
    stats: {
      total: memory.documents.length,
      published: memory.documents.filter((item) => item.lifecycleStatus === "published").length,
      inReview: memory.documents.filter((item) => item.lifecycleStatus === "in_review").length,
      parseIssues: memory.documents.filter((item) => item.parseStatus === "failed" || item.parseStatus === "external_service_required").length,
      expiryAlerts: expiryAlerts.length,
      qaPending: memory.qaSamples.filter((item) => item.result === "pending").length,
    },
    alerts: { expiry: expiryAlerts, parse: memory.documents.filter((item) => item.parseStatus === "failed" || item.parseStatus === "external_service_required").map((item) => ({ documentId: item.id, title: item.title, status: item.parseStatus, message: item.lastError })) },
    index: { status: health.status, mode: health.mode, providers: health.providers, capabilities: health.capabilities, activeIndex: health.activeIndex, indexedNamespaces: health.indexedNamespaces },
    persistence: getRuntimeBindings()?.DB ? "d1" : "memory",
    updatedAt: memory.updatedAt,
  };
}

export async function registerKnowledge(input: { metadata: KnowledgeMetadata; file: { name: string; type: string; content: string } }, actor: string) {
  return mutate(async () => {
    const id = `KB-${input.metadata.agentId.replace("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const ext = extension(input.file.name);
    let content = input.file.content.trim();
    let parseStatus: ManagedKnowledgeDocument["parseStatus"] = "parsed";
    let lastError: string | undefined;
    if (EXTERNAL_EXTENSIONS.has(ext)) {
      parseStatus = "external_service_required"; content = "";
      lastError = "该文件需要文档解析/OCR能力；当前等待甲方AI中台解析适配器接入。";
    } else if (!TEXT_EXTENSIONS.has(ext) && !input.file.type.startsWith("text/")) {
      parseStatus = "failed"; content = ""; lastError = "当前演示管理端不支持该文件类型。";
    } else if (!content) {
      parseStatus = "failed"; lastError = "文件内容为空，无法生成知识分块。";
    } else if (ext === "json") {
      try { content = JSON.stringify(JSON.parse(content), null, 2); }
      catch { parseStatus = "failed"; lastError = "JSON 文档格式无效，解析失败。"; }
    }
    const base: ManagedKnowledgeDocument = {
      id, ...input.metadata, lifecycleStatus: "draft", parseStatus, fileName: input.file.name, fileType: input.file.type || "text/plain",
      content, checksum: content ? await sha256(content) : "", chunks: [], createdAt: now(), updatedAt: now(), lastError, revisions: [], seeded: false,
    };
    if (parseStatus === "parsed") {
      const chunks = await chunkKnowledgeDocument(runtimeDocument(base));
      base.chunks = chunks.map((chunk, index) => ({ chunkId: chunk.chunkId, order: index + 1, characters: chunk.content.length, excerpt: chunk.content.slice(0, 240) }));
    }
    base.revisions.push(revisionOf(base, actor, "首次登记"));
    memory.documents.unshift(base);
    return base;
  });
}

export async function updateKnowledgeMetadata(id: string, patch: Partial<KnowledgeMetadata>, actor: string) {
  return mutate(async () => {
    const document = findDocument(id);
    if (document.lifecycleStatus === "published") throw new KnowledgeAdminError("PUBLISHED_METADATA_LOCKED", 409, "已发布资产需先撤回或创建新版本后再修改");
    document.revisions.push(revisionOf(document, actor, "修改元数据前快照"));
    Object.assign(document, patch, { updatedAt: now() });
    return document;
  });
}

export async function submitKnowledgeReview(id: string, actor: string) {
  return mutate(async () => {
    const document = findDocument(id);
    if (document.parseStatus !== "parsed") throw new KnowledgeAdminError("DOCUMENT_NOT_PARSED", 409, "文档解析未完成，不能提交审核");
    if (document.lifecycleStatus !== "draft" && document.lifecycleStatus !== "withdrawn") throw new KnowledgeAdminError("INVALID_LIFECYCLE", 409, "当前状态不能提交审核");
    document.revisions.push(revisionOf(document, actor, "提交审核前快照"));
    document.lifecycleStatus = "in_review"; document.updatedAt = now(); return document;
  });
}

export async function publishKnowledge(id: string, actor: string, signal?: AbortSignal) {
  return mutate(async () => {
    const document = findDocument(id);
    if (document.lifecycleStatus !== "in_review") throw new KnowledgeAdminError("REVIEW_REQUIRED", 409, "知识资产须先完成提交审核");
    if (document.parseStatus !== "parsed" || !document.content) throw new KnowledgeAdminError("DOCUMENT_NOT_PARSED", 409, "文档解析未完成，不能发布索引");
    const namespace = namespaceFor(document.agentId);
    const [publication] = await getSharedRagRuntime().upsertDocuments(namespace, [runtimeDocument(document, "published")], signal);
    document.revisions.push(revisionOf(document, actor, "发布前快照"));
    document.lifecycleStatus = "published"; document.publishedAt = new Date().toISOString().slice(0, 10);
    document.publishedIndexVersion = publication.indexVersion; document.publicationNamespace = namespace; document.updatedAt = now();
    memory.publications.push({ id: uid("PUB"), documentId: id, agentId: document.agentId, action: "publish", version: document.version, indexVersion: publication.indexVersion, actor, createdAt: now(), detail: `已发布 ${publication.chunkCount} 个索引分块。` });
    return document;
  });
}

export async function withdrawKnowledge(id: string, actor: string, signal?: AbortSignal) {
  return mutate(async () => {
    const document = findDocument(id);
    if (document.lifecycleStatus !== "published") throw new KnowledgeAdminError("INVALID_LIFECYCLE", 409, "仅已发布资产可以撤回");
    document.revisions.push(revisionOf(document, actor, "撤回前快照"));
    const namespace = document.publicationNamespace ?? namespaceFor(document.agentId);
    const publication = await getSharedRagRuntime().deleteDocuments(namespace, [document.id], signal);
    document.lifecycleStatus = "withdrawn"; document.updatedAt = now();
    memory.publications.push({ id: uid("PUB"), documentId: id, agentId: document.agentId, action: "withdraw", version: document.version, indexVersion: publication?.indexVersion, actor, createdAt: now(), detail: "已从当前检索索引撤回，保留版本与审计记录。" });
    return document;
  });
}

export async function rollbackKnowledge(id: string, revisionId: string | undefined, actor: string, signal?: AbortSignal) {
  return mutate(async () => {
    const document = findDocument(id);
    if (document.lifecycleStatus !== "withdrawn") throw new KnowledgeAdminError("INVALID_LIFECYCLE", 409, "仅已撤回资产可以执行发布版本回滚");
    const revision = revisionId ? document.revisions.find((item) => item.revisionId === revisionId) : document.revisions.at(-1);
    if (!revision) throw new KnowledgeAdminError("REVISION_NOT_FOUND", 404, "没有可回滚的历史版本");
    document.revisions.push(revisionOf(document, actor, "回滚操作前快照"));
    Object.assign(document, revision.metadata, { content: revision.content, lifecycleStatus: "in_review", updatedAt: now() });
    const chunks = await chunkKnowledgeDocument(runtimeDocument(document));
    document.chunks = chunks.map((chunk, index) => ({ chunkId: chunk.chunkId, order: index + 1, characters: chunk.content.length, excerpt: chunk.content.slice(0, 240) }));
    const namespace = namespaceFor(document.agentId);
    const [publication] = await getSharedRagRuntime().upsertDocuments(namespace, [runtimeDocument(document, "published")], signal);
    document.lifecycleStatus = "published"; document.publishedIndexVersion = publication.indexVersion; document.publicationNamespace = namespace;
    memory.publications.push({ id: uid("PUB"), documentId: id, agentId: document.agentId, action: "rollback", version: document.version, indexVersion: publication.indexVersion, actor, createdAt: now(), detail: `已回滚至修订 ${revision.revisionId} 并重新发布索引。` });
    return document;
  });
}

export async function reviewQaSample(id: string, result: "pass" | "fail", note: string, actor: string) {
  return mutate(async () => {
    const sample = memory.qaSamples.find((item) => item.id === id);
    if (!sample) throw new KnowledgeAdminError("QA_SAMPLE_NOT_FOUND", 404, "未找到抽样复核任务");
    sample.result = result; sample.note = note.trim() || (result === "pass" ? "抽样结果符合预期。" : "抽样结果需要整改。");
    sample.reviewedAt = now(); sample.reviewer = actor; return sample;
  });
}

export function resetKnowledgeAdminForTests(): void { memory = seedSnapshot(); mutationTail = Promise.resolve(); }
