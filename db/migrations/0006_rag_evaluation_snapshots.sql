CREATE TABLE IF NOT EXISTS rag_evaluation_snapshots (
  tenant_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, snapshot_id)
);

CREATE INDEX IF NOT EXISTS rag_evaluation_snapshots_updated_idx
ON rag_evaluation_snapshots (updated_at);
