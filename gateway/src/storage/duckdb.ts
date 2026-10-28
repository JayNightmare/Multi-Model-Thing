import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import type {
	DownstreamStatus,
	TraceRecord,
} from "../contracts/interceptor.js";
import type { ContractViolation, FuzzerMode } from "../contracts/schemas.js";
import { migrateUp } from "./migrate.js";

export type EdgeHealth = "green" | "amber" | "red";

export interface EdgeSummary {
	edgeId: string;
	total: number;
	passed: number;
	violations: number;
	recovered: number;
	breached: number;
	health: EdgeHealth;
}

export interface RunSummary {
	runId: string;
	workflowName: string;
	fuzzerMode: FuzzerMode;
	seed: string | null;
	startedAt: string;
	completedAt: string | null;
	totalMutations: number;
	brokenContracts: number;
	recoveryRate: number;
	edges: EdgeSummary[];
}

export interface StoredTrace {
	traceId: string;
	runId: string;
	edgeId: string;
	sourceNodeId: string;
	targetNodeId: string;
	mutationType: string;
	strategy: string | null;
	fuzzerFallback: boolean;
	originalPayload: unknown;
	perturbedPayload: unknown;
	contractViolated: boolean;
	violations: ContractViolation[];
	downstreamStatus: DownstreamStatus;
	caughtError: string | null;
	durationMs: number;
	timestamp: string;
}

export interface TraceQuery {
	runId?: string;
	edgeId?: string;
	limit?: number;
}

export interface TermsAcceptance {
	version: string;
	acceptedAt: string;
}

export interface TraceStore {
	init(): Promise<void>;
	ping(): Promise<boolean>;
	createRun(run: {
		runId: string;
		workflowName: string;
		fuzzerMode: FuzzerMode;
		startedAt: string;
		seed?: string;
	}): Promise<void>;
	ensureRun(runId: string, fuzzerMode: FuzzerMode): Promise<void>;
	saveTrace(trace: TraceRecord): Promise<void>;
	completeRun(runId: string, completedAt: string): Promise<void>;
	listTraces(query: TraceQuery): Promise<StoredTrace[]>;
	listRuns(limit?: number): Promise<RunSummary[]>;
	recordAcceptance(login: string, version: string): Promise<void>;
	latestAcceptance(login: string): Promise<TermsAcceptance | null>;
	close(): Promise<void>;
}

export function classifyEdgeHealth(
	breached: number,
	violations: number,
): EdgeHealth {
	if (breached > 0) return "red";
	if (violations > 0) return "amber";
	return "green";
}

type Row = Record<string, unknown>;

// Share of contract violations the downstream agent survived; 100 when nothing was violated.
export function recoveryRate(recovered: number, violations: number): number {
	return violations > 0
		? Math.round((recovered / violations) * 1000) / 10
		: 100;
}

const parseJson = (value: unknown): unknown =>
	typeof value === "string" ? JSON.parse(value) : value;

export class DuckDbTraceStore implements TraceStore {
	private instance?: DuckDBInstance;
	private connection?: DuckDBConnection;
	private queue: Promise<unknown> = Promise.resolve();

	constructor(private readonly path: string) {}

	async init(): Promise<void> {
		if (this.path !== ":memory:")
			mkdirSync(dirname(this.path), { recursive: true });
		this.instance = await DuckDBInstance.create(this.path);
		this.connection = await this.instance.connect();
		await migrateUp(this.connection);
	}

	async ping(): Promise<boolean> {
		try {
			await this.query("SELECT 1 AS ok");
			return true;
		} catch {
			return false;
		}
	}

	async createRun(run: {
		runId: string;
		workflowName: string;
		fuzzerMode: FuzzerMode;
		startedAt: string;
		seed?: string;
	}): Promise<void> {
		await this.exec(
			"INSERT INTO workflow_runs (run_id, workflow_name, fuzzer_mode, started_at, seed) VALUES (?, ?, ?, CAST(? AS TIMESTAMP), ?)",
			[
				run.runId,
				run.workflowName,
				run.fuzzerMode,
				run.startedAt,
				run.seed ?? null,
			],
		);
	}

	async ensureRun(runId: string, fuzzerMode: FuzzerMode): Promise<void> {
		const rows = await this.query(
			"SELECT run_id FROM workflow_runs WHERE run_id = ?",
			[runId],
		);
		if (rows.length === 0) {
			await this.createRun({
				runId,
				workflowName: "ingested",
				fuzzerMode,
				startedAt: new Date().toISOString(),
			});
		}
	}

	async saveTrace(t: TraceRecord): Promise<void> {
		await this.exec(
			`INSERT INTO mutation_traces (
         trace_id, run_id, edge_id, source_node_id, target_node_id, mutation_type, strategy, fuzzer_fallback,
         original_json, mutated_json, contract_violated, violations_json, downstream_status, error_log, duration_ms, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, CAST(? AS JSON), ?, ?, ?, CAST(? AS TIMESTAMP))`,
			[
				t.traceId,
				t.runId,
				t.edgeId,
				t.sourceNodeId,
				t.targetNodeId,
				t.mutationType,
				t.strategy ?? null,
				t.fuzzerFallback,
				JSON.stringify(t.originalPayload ?? null),
				JSON.stringify(t.perturbedPayload ?? null),
				t.contractViolated,
				JSON.stringify(t.violations),
				t.downstreamStatus,
				t.caughtError ?? null,
				t.durationMs,
				t.timestamp,
			],
		);
	}

	async completeRun(runId: string, completedAt: string): Promise<void> {
		const [agg] = await this.query(
			`SELECT
         CAST(COALESCE(SUM(CASE WHEN mutation_type <> 'NONE' THEN 1 ELSE 0 END), 0) AS INTEGER) AS mutations,
         CAST(COALESCE(SUM(CASE WHEN downstream_status = 'FAILED' THEN 1 ELSE 0 END), 0) AS INTEGER) AS broken,
         CAST(COALESCE(SUM(CASE WHEN contract_violated THEN 1 ELSE 0 END), 0) AS INTEGER) AS violations,
         CAST(COALESCE(SUM(CASE WHEN contract_violated AND downstream_status <> 'FAILED' THEN 1 ELSE 0 END), 0) AS INTEGER) AS recovered
       FROM mutation_traces WHERE run_id = ?`,
			[runId],
		);
		const mutations = Number(agg?.mutations ?? 0);
		const rate = recoveryRate(
			Number(agg?.recovered ?? 0),
			Number(agg?.violations ?? 0),
		);
		await this.exec(
			"UPDATE workflow_runs SET completed_at = CAST(? AS TIMESTAMP), total_mutations = ?, broken_contracts = ?, recovery_rate = ? WHERE run_id = ?",
			[
				completedAt,
				mutations,
				Number(agg?.broken ?? 0),
				rate,
				runId,
			],
		);
	}

	async listTraces(query: TraceQuery): Promise<StoredTrace[]> {
		const where: string[] = [];
		const params: (string | number)[] = [];
		if (query.runId) {
			where.push("run_id = ?");
			params.push(query.runId);
		}
		if (query.edgeId) {
			where.push("edge_id = ?");
			params.push(query.edgeId);
		}
		params.push(query.limit ?? 500);

		const rows = await this.query(
			`SELECT trace_id, run_id, edge_id, source_node_id, target_node_id, mutation_type, strategy, fuzzer_fallback,
              CAST(original_json AS VARCHAR) AS original_json, CAST(mutated_json AS VARCHAR) AS mutated_json,
              contract_violated, CAST(violations_json AS VARCHAR) AS violations_json, downstream_status, error_log,
              duration_ms, strftime(created_at, '%Y-%m-%dT%H:%M:%S.%gZ') AS created_at
       FROM mutation_traces ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC LIMIT ?`,
			params,
		);

		return rows.map((r) => ({
			traceId: String(r.trace_id),
			runId: String(r.run_id),
			edgeId: String(r.edge_id),
			sourceNodeId: String(r.source_node_id),
			targetNodeId: String(r.target_node_id),
			mutationType: String(r.mutation_type),
			strategy: (r.strategy as string | null) ?? null,
			fuzzerFallback: Boolean(r.fuzzer_fallback),
			originalPayload: parseJson(r.original_json),
			perturbedPayload: parseJson(r.mutated_json),
			contractViolated: Boolean(r.contract_violated),
			violations:
				(parseJson(r.violations_json) as
					| ContractViolation[]
					| null) ?? [],
			downstreamStatus:
				r.downstream_status as DownstreamStatus,
			caughtError: (r.error_log as string | null) ?? null,
			durationMs: Number(r.duration_ms),
			timestamp: String(r.created_at),
		}));
	}

	async listRuns(limit = 50): Promise<RunSummary[]> {
		const runs = await this.query(
			`SELECT run_id, workflow_name, fuzzer_mode, seed, strftime(started_at, '%Y-%m-%dT%H:%M:%S.%gZ') AS started_at,
              strftime(completed_at, '%Y-%m-%dT%H:%M:%S.%gZ') AS completed_at, total_mutations, broken_contracts, recovery_rate
       FROM workflow_runs ORDER BY started_at DESC LIMIT ?`,
			[limit],
		);
		if (runs.length === 0) return [];

		const edgeRows = await this.query(
			`SELECT run_id, edge_id,
              CAST(COUNT(*) AS INTEGER) AS total,
              CAST(SUM(CASE WHEN contract_violated THEN 0 ELSE 1 END) AS INTEGER) AS passed,
              CAST(SUM(CASE WHEN contract_violated THEN 1 ELSE 0 END) AS INTEGER) AS violations,
              CAST(SUM(CASE WHEN contract_violated AND downstream_status <> 'FAILED' THEN 1 ELSE 0 END) AS INTEGER) AS recovered,
              CAST(SUM(CASE WHEN downstream_status = 'FAILED' THEN 1 ELSE 0 END) AS INTEGER) AS breached
       FROM mutation_traces GROUP BY run_id, edge_id ORDER BY edge_id`,
		);

		return runs.map((r) => ({
			runId: String(r.run_id),
			workflowName: String(r.workflow_name),
			fuzzerMode: r.fuzzer_mode as FuzzerMode,
			seed: (r.seed as string | null) ?? null,
			startedAt: String(r.started_at),
			completedAt: (r.completed_at as string | null) ?? null,
			totalMutations: Number(r.total_mutations ?? 0),
			brokenContracts: Number(r.broken_contracts ?? 0),
			recoveryRate: Number(r.recovery_rate ?? 100),
			edges: edgeRows
				.filter((e) => e.run_id === r.run_id)
				.map((e) => ({
					edgeId: String(e.edge_id),
					total: Number(e.total),
					passed: Number(e.passed),
					violations: Number(e.violations),
					recovered: Number(e.recovered),
					breached: Number(e.breached),
					health: classifyEdgeHealth(
						Number(e.breached),
						Number(e.violations),
					),
				})),
		}));
	}

	/** Keeps the first acceptance of a version; logins are matched case-insensitively. */
	async recordAcceptance(login: string, version: string): Promise<void> {
		await this.exec(
			"INSERT INTO terms_acceptances (login, version, accepted_at) VALUES (?, ?, CAST(? AS TIMESTAMP)) ON CONFLICT DO NOTHING",
			[
				login.toLowerCase(),
				version,
				new Date().toISOString(),
			],
		);
	}

	async latestAcceptance(login: string): Promise<TermsAcceptance | null> {
		const [row] = await this.query(
			`SELECT version, strftime(accepted_at, '%Y-%m-%dT%H:%M:%S.%gZ') AS accepted_at
       FROM terms_acceptances WHERE login = ? ORDER BY accepted_at DESC LIMIT 1`,
			[login.toLowerCase()],
		);
		return row
			? {
					version: String(row.version),
					acceptedAt: String(row.accepted_at),
				}
			: null;
	}

	async close(): Promise<void> {
		await this.queue.catch(() => undefined);
		this.connection?.closeSync();
		this.instance?.closeSync();
		this.connection = undefined;
		this.instance = undefined;
	}

	// The node-api connection is not safe for interleaved statements; serialize all access.
	private enqueue<T>(task: () => Promise<T>): Promise<T> {
		const next = this.queue.then(task, task);
		this.queue = next.catch(() => undefined);
		return next;
	}

	private async exec(sql: string, params: unknown[] = []): Promise<void> {
		await this.enqueue(async () => {
			await this.requireConnection().run(
				sql,
				params as never,
			);
		});
	}

	private async query(
		sql: string,
		params: unknown[] = [],
	): Promise<Row[]> {
		return this.enqueue(async () => {
			const reader =
				await this.requireConnection().runAndReadAll(
					sql,
					params as never,
				);
			return reader.getRowObjectsJson() as Row[];
		});
	}

	private requireConnection(): DuckDBConnection {
		if (!this.connection)
			throw new Error("DuckDB store is not initialised");
		return this.connection;
	}
}
