-- seed makes heuristic runs replayable. recovery_rate becomes recovered / violated (was recovered / mutations).
ALTER TABLE workflow_runs ADD COLUMN seed VARCHAR;

UPDATE workflow_runs SET recovery_rate = COALESCE((
  SELECT CASE
    WHEN SUM(CASE WHEN t.contract_violated THEN 1 ELSE 0 END) = 0 THEN 100.0
    ELSE ROUND(1000.0 * SUM(CASE WHEN t.contract_violated AND t.downstream_status <> 'FAILED' THEN 1 ELSE 0 END)
      / SUM(CASE WHEN t.contract_violated THEN 1 ELSE 0 END)) / 10.0
  END
  FROM mutation_traces t WHERE t.run_id = workflow_runs.run_id
), 100.0)
WHERE completed_at IS NOT NULL;
