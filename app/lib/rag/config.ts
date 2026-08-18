import { z } from "zod/v4";

const OptionalUrlSchema = z.string().url().optional();
export const RagRuntimeConfigSchema = z.object({
  mode: z.enum(["disabled", "local", "remote"]),
  model: z.object({ provider: z.enum(["qwen", "deepseek", "openai-compatible", "client-ai-platform", "disabled"]), baseUrl: OptionalUrlSchema, apiKey: z.string().min(1).optional(), model: z.string().min(1).optional(), timeoutMs: z.number().int().positive() }),
  embedding: z.object({ provider: z.enum(["qwen", "openai-compatible", "client-ai-platform", "disabled"]), baseUrl: OptionalUrlSchema, apiKey: z.string().min(1).optional(), model: z.string().min(1).optional(), timeoutMs: z.number().int().positive(), maxBatch: z.number().int().positive().max(100) }),
  rerank: z.object({ provider: z.enum(["qwen", "http", "local", "disabled"]), baseUrl: OptionalUrlSchema, apiKey: z.string().min(1).optional(), model: z.string().min(1).optional(), timeoutMs: z.number().int().positive() }),
  retrieval: z.object({ retrieveK: z.number().int().positive().max(100), rerankK: z.number().int().positive().max(50), contextK: z.number().int().positive().max(20), rrfK: z.number().int().positive(), minEvidence: z.number().int().positive(), maxIndexVersions: z.number().int().min(2).max(100) }),
  storage: z.object({ maxChunksPerNamespace: z.number().int().positive().max(100_000), maxTotalChunks: z.number().int().positive().max(1_000_000) }),
}).superRefine((value, context) => {
  if (value.retrieval.retrieveK < value.retrieval.rerankK || value.retrieval.rerankK < value.retrieval.contextK) context.addIssue({ code: "custom", message: "retrieveK must be >= rerankK >= contextK", path: ["retrieval"] });
  if (value.mode === "remote") for (const component of ["model", "embedding"] as const) {
    const item = value[component];
    if (item.provider === "disabled" || !item.baseUrl || !item.apiKey || !item.model) context.addIssue({ code: "custom", message: `${component} remote configuration is incomplete`, path: [component] });
  }
  if (value.rerank.provider === "qwen" || value.rerank.provider === "http") {
    if (!value.rerank.baseUrl || !value.rerank.apiKey || !value.rerank.model) context.addIssue({ code: "custom", message: "rerank remote configuration is incomplete", path: ["rerank"] });
  }
});
export type RagRuntimeConfig = z.infer<typeof RagRuntimeConfigSchema>;

function integer(source: Record<string, string | undefined>, key: string, fallback: number): number { const value = source[key]; return value ? Number.parseInt(value, 10) : fallback; }
function modelBaseUrl(provider: string): string | undefined { if (provider === "deepseek") return "https://api.deepseek.com"; if (provider === "qwen") return "https://dashscope.aliyuncs.com/compatible-mode/v1"; return undefined; }
function embeddingBaseUrl(provider: string): string | undefined { return provider === "qwen" ? "https://dashscope.aliyuncs.com/compatible-mode/v1" : undefined; }
function rerankBaseUrl(provider: string): string | undefined { return provider === "qwen" ? "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank" : undefined; }

export function loadRagRuntimeConfig(source: Record<string, string | undefined> = process.env): RagRuntimeConfig {
  const modelProvider = source.MODEL_PROVIDER ?? "disabled";
  const embeddingProvider = source.EMBEDDING_PROVIDER ?? "disabled";
  const rerankProvider = source.RERANK_PROVIDER ?? "local";
  return RagRuntimeConfigSchema.parse({
    mode: source.RAG_RUNTIME_MODE ?? "local",
    model: { provider: modelProvider, baseUrl: source.MODEL_BASE_URL || modelBaseUrl(modelProvider), apiKey: source.MODEL_API_KEY, model: source.MODEL_NAME, timeoutMs: integer(source, "MODEL_TIMEOUT_MS", 20_000) },
    embedding: { provider: embeddingProvider, baseUrl: source.EMBEDDING_BASE_URL || embeddingBaseUrl(embeddingProvider), apiKey: source.EMBEDDING_API_KEY, model: source.EMBEDDING_MODEL, timeoutMs: integer(source, "EMBEDDING_TIMEOUT_MS", 15_000), maxBatch: integer(source, "EMBEDDING_MAX_BATCH", embeddingProvider === "qwen" ? 10 : 32) },
    rerank: { provider: rerankProvider, baseUrl: source.RERANK_BASE_URL || rerankBaseUrl(rerankProvider), apiKey: source.RERANK_API_KEY || (rerankProvider === "qwen" ? source.EMBEDDING_API_KEY : undefined), model: source.RERANK_MODEL || (rerankProvider === "qwen" ? "gte-rerank-v2" : undefined), timeoutMs: integer(source, "RERANK_TIMEOUT_MS", 15_000) },
    retrieval: { retrieveK: integer(source, "RAG_RETRIEVE_K", 20), rerankK: integer(source, "RAG_RERANK_K", 10), contextK: integer(source, "RAG_CONTEXT_K", 6), rrfK: integer(source, "RAG_RRF_K", 60), minEvidence: integer(source, "RAG_MIN_EVIDENCE", 1), maxIndexVersions: integer(source, "RAG_MAX_INDEX_VERSIONS", 20) },
    storage: { maxChunksPerNamespace: integer(source, "RAG_MAX_CHUNKS_PER_NAMESPACE", 10_000), maxTotalChunks: integer(source, "RAG_MAX_TOTAL_CHUNKS", 100_000) },
  });
}
