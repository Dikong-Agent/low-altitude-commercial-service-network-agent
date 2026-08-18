CREATE TABLE IF NOT EXISTS rag_namespace_snapshots (
  namespace TEXT PRIMARY KEY,
  digest TEXT NOT NULL,
  embedding_version TEXT,
  chunks_json TEXT NOT NULL,
  chunk_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rag_namespace_snapshots_updated_at
  ON rag_namespace_snapshots(updated_at);
