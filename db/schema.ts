export const CREATE_AGENT_CONVERSATIONS_SQL = `
CREATE TABLE IF NOT EXISTS agent_conversations (
  tenant_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, subject_id, session_id)
)`;

export const CREATE_AGENT_CONVERSATIONS_EXPIRY_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS agent_conversations_expiry_idx
ON agent_conversations (expires_at)`;

export const CREATE_AGENT_RUNS_SQL = `
CREATE TABLE IF NOT EXISTS agent_runs (
  trace_id TEXT PRIMARY KEY,
  request_id TEXT,
  tenant_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  error_code TEXT,
  capability_version TEXT,
  workflow_version TEXT,
  prompt_version TEXT,
  rule_version TEXT,
  model_version TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  token_input INTEGER,
  token_output INTEGER,
  model_cost_micros INTEGER,
  internal_trace_json TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
)`;

export const CREATE_AGENT_RUN_EVENTS_SQL = `
CREATE TABLE IF NOT EXISTS agent_run_events (
  trace_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_name TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL,
  retry_count INTEGER NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (trace_id, sequence)
)`;

export const CREATE_AGENT_RUN_EVENTS_EXPIRY_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS agent_run_events_expiry_idx ON agent_run_events (expires_at)`;

export const CREATE_DEPENDENCY_CIRCUITS_SQL = `
CREATE TABLE IF NOT EXISTS dependency_circuits (
  circuit_key TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL,
  open_until_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL
)`;

export const CREATE_CALLBACK_RECEIPTS_SQL = `
CREATE TABLE IF NOT EXISTS callback_receipts (
  source TEXT NOT NULL,
  callback_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (source, callback_id)
)`;

export const CREATE_CALLBACK_RECEIPTS_EXPIRY_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS callback_receipts_expiry_idx ON callback_receipts (expires_at)`;

export const CREATE_AGENT_TASKS_SQL = `
CREATE TABLE IF NOT EXISTS agent_tasks (
  task_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  roles_json TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  request_json TEXT NOT NULL,
  state TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (tenant_id, subject_id, agent_id, idempotency_key)
)`;

export const CREATE_AGENT_TASKS_EXPIRY_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS agent_tasks_expiry_idx ON agent_tasks (expires_at)`;

export const CREATE_AGENT_REVIEW_REQUESTS_SQL = `
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
)`;

export const CREATE_AGENT_REVIEW_REQUESTS_OWNER_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS agent_review_requests_owner_idx
ON agent_review_requests (tenant_id, subject_id, updated_at DESC)`;

export const CREATE_AGENT_REVIEW_REQUESTS_EXPIRY_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS agent_review_requests_expiry_idx
ON agent_review_requests (expires_at)`;

export const CREATE_AGENT_RUNS_LOOKUP_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS agent_runs_tenant_created_idx
ON agent_runs (tenant_id, created_at DESC)`;

export const CREATE_AGENT_RUNS_EXPIRY_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS agent_runs_expiry_idx
ON agent_runs (expires_at)`;

export const CREATE_API_USAGE_BUCKETS_SQL = `
CREATE TABLE IF NOT EXISTS api_usage_buckets (
  bucket_key TEXT PRIMARY KEY,
  window_ends_at TEXT NOT NULL,
  request_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
)`;

export const CREATE_API_USAGE_EXPIRY_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS api_usage_expiry_idx
ON api_usage_buckets (window_ends_at)`;

export const CREATE_IDEMPOTENCY_RECORDS_SQL = `
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
)`;

export const CREATE_IDEMPOTENCY_EXPIRY_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idempotency_expiry_idx
ON idempotency_records (expires_at)`;

export const CREATE_AUTH_NONCE_RECORDS_SQL = `
CREATE TABLE IF NOT EXISTS auth_nonce_records (
  tenant_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, nonce)
)`;

export const CREATE_AUTH_NONCE_EXPIRY_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS auth_nonce_expiry_idx
ON auth_nonce_records (expires_at)`;

export const CREATE_RAG_NAMESPACE_SNAPSHOTS_SQL = `
CREATE TABLE IF NOT EXISTS rag_namespace_snapshots (
  namespace TEXT PRIMARY KEY,
  digest TEXT NOT NULL,
  embedding_version TEXT,
  chunks_json TEXT NOT NULL,
  chunk_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
)`;

export const CREATE_RAG_NAMESPACE_SNAPSHOTS_UPDATED_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_rag_namespace_snapshots_updated_at
ON rag_namespace_snapshots(updated_at)`;

export const CREATE_KNOWLEDGE_ADMIN_SNAPSHOTS_SQL = `
CREATE TABLE IF NOT EXISTS knowledge_admin_snapshots (
  tenant_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, snapshot_id)
)`;

export const CREATE_KNOWLEDGE_ADMIN_SNAPSHOTS_UPDATED_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS knowledge_admin_snapshots_updated_idx
ON knowledge_admin_snapshots (updated_at)`;

export const CREATE_RAG_EVALUATION_SNAPSHOTS_SQL = `
CREATE TABLE IF NOT EXISTS rag_evaluation_snapshots (
  tenant_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, snapshot_id)
)`;

export const CREATE_RAG_EVALUATION_SNAPSHOTS_UPDATED_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS rag_evaluation_snapshots_updated_idx
ON rag_evaluation_snapshots (updated_at)`;
