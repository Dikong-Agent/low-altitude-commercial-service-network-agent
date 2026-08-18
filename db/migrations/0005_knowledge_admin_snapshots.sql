CREATE TABLE IF NOT EXISTS knowledge_admin_snapshots (
  tenant_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, snapshot_id)
);

CREATE INDEX IF NOT EXISTS knowledge_admin_snapshots_updated_idx
ON knowledge_admin_snapshots (updated_at);
