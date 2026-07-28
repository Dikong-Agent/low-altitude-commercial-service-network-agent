CREATE TABLE IF NOT EXISTS agent_conversations (
  tenant_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, subject_id, session_id)
);
CREATE INDEX IF NOT EXISTS agent_conversations_expiry_idx ON agent_conversations (expires_at);
CREATE TABLE IF NOT EXISTS agent_runs (
  trace_id TEXT PRIMARY KEY,
  request_id TEXT,
  tenant_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_runs_tenant_created_idx ON agent_runs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_expiry_idx ON agent_runs (expires_at);
CREATE TABLE IF NOT EXISTS api_usage_buckets (
  bucket_key TEXT PRIMARY KEY,
  window_ends_at TEXT NOT NULL,
  request_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS api_usage_expiry_idx ON api_usage_buckets (window_ends_at);
CREATE TABLE IF NOT EXISTS idempotency_records (
  tenant_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  response_json TEXT,
  response_status INTEGER,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, subject_id, agent_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idempotency_expiry_idx ON idempotency_records (expires_at);
