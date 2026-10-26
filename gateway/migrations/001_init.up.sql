-- No foreign keys: DuckDB rejects updates to parent rows that have children.
CREATE TABLE IF NOT EXISTS workflow_runs (
  run_id VARCHAR PRIMARY KEY,
  workflow_name VARCHAR NOT NULL,
  fuzzer_mode VARCHAR NOT NULL CHECK (fuzzer_mode IN ('heuristic', 'semantic')),
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  total_mutations INTEGER NOT NULL DEFAULT 0,
  broken_contracts INTEGER NOT NULL DEFAULT 0,
  recovery_rate DOUBLE NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS mutation_traces (
  trace_id VARCHAR PRIMARY KEY,
  run_id VARCHAR NOT NULL,
  edge_id VARCHAR NOT NULL,
  source_node_id VARCHAR NOT NULL,
  target_node_id VARCHAR NOT NULL,
  mutation_type VARCHAR NOT NULL CHECK (mutation_type IN ('NONE', 'TYPE_SWAP', 'KEY_OMISSION', 'BOUNDARY_OVERFLOW', 'SEMANTIC_DRIFT')),
  strategy VARCHAR,
  fuzzer_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  original_json JSON,
  mutated_json JSON,
  contract_violated BOOLEAN NOT NULL,
  violations_json JSON,
  downstream_status VARCHAR NOT NULL CHECK (downstream_status IN ('HANDLED', 'FAILED', 'BYPASSED')),
  error_log TEXT,
  duration_ms DOUBLE NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mutation_traces_run_id ON mutation_traces (run_id);
CREATE INDEX IF NOT EXISTS idx_mutation_traces_edge_id ON mutation_traces (edge_id);
