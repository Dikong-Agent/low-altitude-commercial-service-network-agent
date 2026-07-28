ALTER TABLE agent_runs ADD COLUMN capability_version TEXT;
ALTER TABLE agent_runs ADD COLUMN workflow_version TEXT;
ALTER TABLE agent_runs ADD COLUMN prompt_version TEXT;
ALTER TABLE agent_runs ADD COLUMN rule_version TEXT;
ALTER TABLE agent_runs ADD COLUMN model_version TEXT;
ALTER TABLE agent_runs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_runs ADD COLUMN token_input INTEGER;
ALTER TABLE agent_runs ADD COLUMN token_output INTEGER;
ALTER TABLE agent_runs ADD COLUMN model_cost_micros INTEGER;
ALTER TABLE agent_runs ADD COLUMN internal_trace_json TEXT;

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
);
CREATE INDEX IF NOT EXISTS agent_run_events_expiry_idx ON agent_run_events (expires_at);

CREATE TABLE IF NOT EXISTS dependency_circuits (
  circuit_key TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL,
  open_until_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS callback_receipts (
  source TEXT NOT NULL,
  callback_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (source, callback_id)
);
CREATE INDEX IF NOT EXISTS callback_receipts_expiry_idx ON callback_receipts (expires_at);

CREATE TABLE IF NOT EXISTS agent_tasks (
  task_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  roles_json TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_json TEXT NOT NULL,
  state TEXT NOT NULL,
  result_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (tenant_id, subject_id, agent_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS agent_tasks_expiry_idx ON agent_tasks (expires_at);
