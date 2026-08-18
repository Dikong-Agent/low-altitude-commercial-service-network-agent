import { KnowledgeChunkSchema, type KnowledgeChunk } from "./contracts.ts";
import { getRuntimeBindings } from "../runtime-bindings.ts";

export interface PersistedRagNamespace {
  namespace: string;
  digest: string;
  embeddingVersion?: string;
  chunks: KnowledgeChunk[];
  updatedAt: string;
}

export interface RagKnowledgeStore {
  load(namespace: string): Promise<PersistedRagNamespace | null>;
  save(value: PersistedRagNamespace): Promise<void>;
  delete(namespace: string): Promise<void>;
}
function portableChunk(chunk: KnowledgeChunk): KnowledgeChunk { const copy = { ...chunk }; delete copy.indexVersion; return copy; }

type StoredRow = { namespace: string; digest: string; embedding_version: string | null; chunks_json: string; updated_at: string };

export class D1RagKnowledgeStore implements RagKnowledgeStore {
  private database() {
    const database = getRuntimeBindings()?.DB;
    if (!database) throw new Error("RAG persistence requires a D1 database binding");
    return database;
  }

  async load(namespace: string): Promise<PersistedRagNamespace | null> {
    const row = await this.database().prepare("SELECT namespace, digest, embedding_version, chunks_json, updated_at FROM rag_namespace_snapshots WHERE namespace = ?").bind(namespace).first<StoredRow>();
    if (!row) return null;
    const parsed = JSON.parse(row.chunks_json) as unknown[];
    return { namespace: row.namespace, digest: row.digest, embeddingVersion: row.embedding_version ?? undefined, chunks: parsed.map((item) => KnowledgeChunkSchema.parse(item)), updatedAt: row.updated_at };
  }

  async save(value: PersistedRagNamespace): Promise<void> {
    const chunks = value.chunks.map(portableChunk);
    await this.database().prepare("INSERT INTO rag_namespace_snapshots (namespace, digest, embedding_version, chunks_json, chunk_count, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(namespace) DO UPDATE SET digest = excluded.digest, embedding_version = excluded.embedding_version, chunks_json = excluded.chunks_json, chunk_count = excluded.chunk_count, updated_at = excluded.updated_at")
      .bind(value.namespace, value.digest, value.embeddingVersion ?? null, JSON.stringify(chunks), chunks.length, value.updatedAt).run();
  }

  async delete(namespace: string): Promise<void> {
    await this.database().prepare("DELETE FROM rag_namespace_snapshots WHERE namespace = ?").bind(namespace).run();
  }
}

class RuntimeBoundRagKnowledgeStore implements RagKnowledgeStore {
  private readonly delegate = new D1RagKnowledgeStore();
  load(namespace: string): Promise<PersistedRagNamespace | null> { return getRuntimeBindings()?.DB ? this.delegate.load(namespace) : Promise.resolve(null); }
  save(value: PersistedRagNamespace): Promise<void> { return getRuntimeBindings()?.DB ? this.delegate.save(value) : Promise.resolve(); }
  delete(namespace: string): Promise<void> { return getRuntimeBindings()?.DB ? this.delegate.delete(namespace) : Promise.resolve(); }
}

export function createRuntimeRagKnowledgeStore(): RagKnowledgeStore {
  return new RuntimeBoundRagKnowledgeStore();
}
