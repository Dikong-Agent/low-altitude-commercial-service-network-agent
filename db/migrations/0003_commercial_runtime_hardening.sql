CREATE TABLE IF NOT EXISTS auth_nonce_records (
  tenant_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, nonce)
);

CREATE INDEX IF NOT EXISTS auth_nonce_expiry_idx ON auth_nonce_records (expires_at);

ALTER TABLE agent_tasks ADD COLUMN request_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE agent_tasks ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
