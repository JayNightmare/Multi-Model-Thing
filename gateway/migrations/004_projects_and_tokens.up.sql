-- Projects own contracts, runs and traces. The built-in demo project is seeded at startup.
CREATE TABLE IF NOT EXISTS projects (
  project_id VARCHAR PRIMARY KEY,
  owner_login VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_agents (
  project_id VARCHAR NOT NULL,
  agent_id VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  role VARCHAR NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, agent_id)
);

CREATE TABLE IF NOT EXISTS project_edges (
  project_id VARCHAR NOT NULL,
  edge_id VARCHAR NOT NULL,
  source_id VARCHAR NOT NULL,
  target_id VARCHAR NOT NULL,
  label VARCHAR NOT NULL,
  contract_json JSON NOT NULL,
  contract_hint VARCHAR,
  baseline_json JSON NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, edge_id)
);

ALTER TABLE workflow_runs ADD COLUMN project_id VARCHAR;

ALTER TABLE workflow_runs ADD COLUMN owner_login VARCHAR;

UPDATE workflow_runs SET project_id = 'demo' WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_runs_project_id ON workflow_runs (project_id);

CREATE TABLE IF NOT EXISTS api_tokens (
  token_id VARCHAR PRIMARY KEY,
  token_hash VARCHAR NOT NULL,
  login VARCHAR NOT NULL,
  client_name VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens (token_hash);
