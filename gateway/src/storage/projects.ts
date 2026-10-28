import {
	DEMO_AGENTS,
	DEMO_EDGES,
	DEMO_OWNER,
	DEMO_PROJECT_ID,
} from "../contracts/demo.js";
import { ISO, type Db } from "./db.js";

export interface ProjectInfo {
	projectId: string;
	name: string;
	ownerLogin: string;
	isDemo: boolean;
	createdAt: string;
	edgeCount: number;
}

export interface AgentRecord {
	id: string;
	name: string;
	role: string;
}

export interface EdgeRecord {
	id: string;
	source: string;
	target: string;
	label: string;
	schema: unknown;
	contractHint: string | null;
	baseline: unknown;
}

const parseJson = (value: unknown): unknown =>
	typeof value === "string" ? JSON.parse(value) : value;

export class ProjectRepo {
	constructor(private readonly db: Db) {}

	async seedDemo(): Promise<void> {
		await this.db.batch(async (run) => {
			await run(
				"INSERT INTO projects (project_id, owner_login, name, is_demo) VALUES (?, ?, ?, TRUE) ON CONFLICT DO NOTHING",
				[
					DEMO_PROJECT_ID,
					DEMO_OWNER,
					"Demo claims workflow",
				],
			);
			for (const [i, a] of DEMO_AGENTS.entries()) {
				await run(
					"INSERT INTO project_agents (project_id, agent_id, name, role, position) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
					[
						DEMO_PROJECT_ID,
						a.id,
						a.name,
						a.role,
						i,
					],
				);
			}
			for (const [i, e] of DEMO_EDGES.entries()) {
				await run(
					"INSERT INTO project_edges (project_id, edge_id, source_id, target_id, label, contract_json, contract_hint, baseline_json, position) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, CAST(? AS JSON), ?) ON CONFLICT DO NOTHING",
					[
						DEMO_PROJECT_ID,
						e.id,
						e.source,
						e.target,
						e.label,
						JSON.stringify(e.schema),
						e.contractHint,
						JSON.stringify(e.baseline),
						i,
					],
				);
			}
		});
	}

	/** The demo project is visible to everyone, other projects only to their owner. */
	async list(owner: string): Promise<ProjectInfo[]> {
		const rows = await this.db.query(
			`SELECT p.project_id, p.name, p.owner_login, p.is_demo, strftime(p.created_at, ${ISO}) AS created_at,
              (SELECT COUNT(*) FROM project_edges e WHERE e.project_id = p.project_id) AS edge_count
       FROM projects p WHERE p.is_demo OR p.owner_login = ?
       ORDER BY p.is_demo DESC, p.created_at ASC`,
			[owner],
		);
		return rows.map(toProject);
	}

	async get(projectId: string): Promise<ProjectInfo | null> {
		const [row] = await this.db.query(
			`SELECT p.project_id, p.name, p.owner_login, p.is_demo, strftime(p.created_at, ${ISO}) AS created_at,
              (SELECT COUNT(*) FROM project_edges e WHERE e.project_id = p.project_id) AS edge_count
       FROM projects p WHERE p.project_id = ?`,
			[projectId],
		);
		return row ? toProject(row) : null;
	}

	async countOwned(owner: string): Promise<number> {
		const [row] = await this.db.query(
			"SELECT COUNT(*) AS n FROM projects WHERE owner_login = ? AND NOT is_demo",
			[owner],
		);
		return Number(row?.n ?? 0);
	}

	async create(project: {
		projectId: string;
		owner: string;
		name: string;
	}): Promise<void> {
		await this.db.exec(
			"INSERT INTO projects (project_id, owner_login, name) VALUES (?, ?, ?)",
			[project.projectId, project.owner, project.name],
		);
	}

	async delete(projectId: string): Promise<void> {
		await this.db.batch(async (run) => {
			await run(
				"DELETE FROM mutation_traces WHERE run_id IN (SELECT run_id FROM workflow_runs WHERE project_id = ?)",
				[projectId],
			);
			await run(
				"DELETE FROM workflow_runs WHERE project_id = ?",
				[projectId],
			);
			await run(
				"DELETE FROM project_edges WHERE project_id = ?",
				[projectId],
			);
			await run(
				"DELETE FROM project_agents WHERE project_id = ?",
				[projectId],
			);
			await run("DELETE FROM projects WHERE project_id = ?", [
				projectId,
			]);
		});
	}

	async getWorkflow(
		projectId: string,
	): Promise<{ agents: AgentRecord[]; edges: EdgeRecord[] }> {
		const agents = await this.db.query(
			"SELECT agent_id, name, role FROM project_agents WHERE project_id = ? ORDER BY position, agent_id",
			[projectId],
		);
		const edges = await this.db.query(
			`SELECT edge_id, source_id, target_id, label, CAST(contract_json AS VARCHAR) AS contract_json,
              contract_hint, CAST(baseline_json AS VARCHAR) AS baseline_json
       FROM project_edges WHERE project_id = ? ORDER BY position, edge_id`,
			[projectId],
		);
		return {
			agents: agents.map((a) => ({
				id: String(a.agent_id),
				name: String(a.name),
				role: String(a.role),
			})),
			edges: edges.map((e) => ({
				id: String(e.edge_id),
				source: String(e.source_id),
				target: String(e.target_id),
				label: String(e.label),
				schema: parseJson(e.contract_json),
				contractHint:
					(e.contract_hint as string | null) ??
					null,
				baseline: parseJson(e.baseline_json),
			})),
		};
	}

	/** Replaces the whole workflow in one batch so readers never see a half-written one. */
	async setWorkflow(
		projectId: string,
		agents: AgentRecord[],
		edges: EdgeRecord[],
	): Promise<void> {
		await this.db.batch(async (run) => {
			await run(
				"DELETE FROM project_edges WHERE project_id = ?",
				[projectId],
			);
			await run(
				"DELETE FROM project_agents WHERE project_id = ?",
				[projectId],
			);
			for (const [i, a] of agents.entries()) {
				await run(
					"INSERT INTO project_agents (project_id, agent_id, name, role, position) VALUES (?, ?, ?, ?, ?)",
					[projectId, a.id, a.name, a.role, i],
				);
			}
			for (const [i, e] of edges.entries()) {
				await run(
					"INSERT INTO project_edges (project_id, edge_id, source_id, target_id, label, contract_json, contract_hint, baseline_json, position) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, CAST(? AS JSON), ?)",
					[
						projectId,
						e.id,
						e.source,
						e.target,
						e.label,
						JSON.stringify(e.schema),
						e.contractHint,
						JSON.stringify(e.baseline),
						i,
					],
				);
			}
		});
	}
}

function toProject(r: Record<string, unknown>): ProjectInfo {
	return {
		projectId: String(r.project_id),
		name: String(r.name),
		ownerLogin: String(r.owner_login),
		isDemo: Boolean(r.is_demo),
		createdAt: String(r.created_at),
		edgeCount: Number(r.edge_count ?? 0),
	};
}
