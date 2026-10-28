DROP INDEX IF EXISTS idx_api_tokens_hash;
DROP TABLE IF EXISTS api_tokens;
DROP INDEX IF EXISTS idx_workflow_runs_project_id;
ALTER TABLE workflow_runs DROP COLUMN owner_login;
ALTER TABLE workflow_runs DROP COLUMN project_id;
DROP TABLE IF EXISTS project_edges;
DROP TABLE IF EXISTS project_agents;
DROP TABLE IF EXISTS projects;
