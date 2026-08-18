import { loadRagRuntimeConfig, type RagRuntimeConfig } from "./config.ts";
import { InMemoryHybridSearch } from "./in-memory-index.ts";
import { RagKernel } from "./kernel.ts";
import { LocalLexicalReranker } from "./local-reranker.ts";
import { HttpRerankPort, OpenAICompatibleEmbeddingPort, OpenAICompatibleModelGateway, QwenRerankPort } from "./adapters/http.ts";

function required(value: string | undefined, name: string): string { if (!value) throw new Error(`${name} is required`); return value; }
export function createRagKernel(config: RagRuntimeConfig = loadRagRuntimeConfig()): RagKernel {
  const search = new InMemoryHybridSearch(config.retrieval.rrfK, config.retrieval.maxIndexVersions);
  const embedding = config.embedding.provider === "disabled" ? undefined : new OpenAICompatibleEmbeddingPort({ provider: config.embedding.provider, baseUrl: required(config.embedding.baseUrl, "EMBEDDING_BASE_URL"), apiKey: required(config.embedding.apiKey, "EMBEDDING_API_KEY"), model: required(config.embedding.model, "EMBEDDING_MODEL"), timeoutMs: config.embedding.timeoutMs });
  const model = config.model.provider === "disabled" ? undefined : new OpenAICompatibleModelGateway({ provider: config.model.provider, baseUrl: required(config.model.baseUrl, "MODEL_BASE_URL"), apiKey: required(config.model.apiKey, "MODEL_API_KEY"), model: required(config.model.model, "MODEL_NAME"), timeoutMs: config.model.timeoutMs });
  const reranker = config.rerank.provider === "disabled" ? undefined : config.rerank.provider === "local" ? new LocalLexicalReranker() : config.rerank.provider === "qwen" ? new QwenRerankPort({ provider: config.rerank.provider, baseUrl: required(config.rerank.baseUrl, "RERANK_BASE_URL"), apiKey: required(config.rerank.apiKey, "RERANK_API_KEY"), model: required(config.rerank.model, "RERANK_MODEL"), timeoutMs: config.rerank.timeoutMs }) : new HttpRerankPort({ provider: config.rerank.provider, baseUrl: required(config.rerank.baseUrl, "RERANK_BASE_URL"), apiKey: required(config.rerank.apiKey, "RERANK_API_KEY"), model: required(config.rerank.model, "RERANK_MODEL"), timeoutMs: config.rerank.timeoutMs });
  return new RagKernel(search, embedding, reranker, model, { minEvidence: config.retrieval.minEvidence, maxEmbeddingBatch: config.embedding.maxBatch });
}
