CREATE TABLE IF NOT EXISTS agent_review_requests (
  review_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  proposed_action TEXT,
  resolution_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_review_requests_owner_idx
ON agent_review_requests (tenant_id, subject_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS agent_review_requests_expiry_idx
ON agent_review_requests (expires_at);

