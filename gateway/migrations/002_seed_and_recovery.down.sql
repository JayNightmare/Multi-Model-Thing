-- The recovery_rate recomputation is not reversible, so only the column is dropped.
ALTER TABLE workflow_runs DROP COLUMN seed;
