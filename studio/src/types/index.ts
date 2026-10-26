export type MutationType =
	| "NONE"
	| "TYPE_SWAP"
	| "KEY_OMISSION"
	| "BOUNDARY_OVERFLOW"
	| "SEMANTIC_DRIFT";
export type FuzzerMode = "heuristic" | "semantic";
export type EdgeHealth = "green" | "amber" | "red";
export type DownstreamStatus = "HANDLED" | "FAILED" | "BYPASSED";

export interface ContractViolation {
	path: string;
	code: string;
	message: string;
}

export interface TraceRecord {
	traceId: string;
	runId: string;
	edgeId: string;
	sourceNodeId: string;
	targetNodeId: string;
	mutationType: MutationType;
	strategy?: string | null;
	fuzzerFallback: boolean;
	originalPayload: unknown;
	perturbedPayload: unknown;
	contractViolated: boolean;
	violations: ContractViolation[];
	downstreamStatus: DownstreamStatus;
	caughtError?: string | null;
	durationMs: number;
	timestamp: string;
}

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
	startedAt: string;
	completedAt: string | null;
	totalMutations: number;
	brokenContracts: number;
	recoveryRate: number;
	edges: EdgeSummary[];
}

export interface ContractField {
	field: string;
	expected: string;
}

export interface AgentInfo {
	id: string;
	name: string;
	role: string;
	lastLatencyMs: number | null;
}

export interface EdgeInfo {
	id: string;
	source: string;
	target: string;
	label: string;
	contractFields: ContractField[];
}

export interface Topology {
	agents: AgentInfo[];
	edges: EdgeInfo[];
}

export type TelemetryFrame =
	| {
			type: "RUN_STARTED";
			runId: string;
			timestamp: string;
			summary: { fuzzerMode: string; edgeId?: string };
	  }
	| {
			type: "TRACE_EMITTED";
			runId: string;
			timestamp: string;
			trace: TraceRecord;
	  }
	| {
			type: "RUN_COMPLETED";
			runId: string;
			timestamp: string;
			summary: { totalTraces: number };
	  }
	| {
			type: "ERROR";
			timestamp: string;
			error: { code: string; message: string };
	  };

export type TelemetryEventResult =
	| "Started"
	| "Pass"
	| "Violation"
	| "Completed";

export interface TelemetryEvent {
	id: string;
	time: string;
	type: "RUN_STARTED" | "TRACE_EMITTED" | "RUN_COMPLETED";
	runId: string;
	edgeId?: string;
	result: TelemetryEventResult;
	mutated: boolean;
}

export interface GatewayHealth {
	status: "healthy" | "degraded" | "unhealthy";
	duckdb: "up" | "down";
	fuzzer: "up" | "down";
}

export interface StartTestRun {
	type: "START_TEST_RUN";
	fuzzerMode: FuzzerMode;
	edgeId?: string;
}

export interface IngestTraceRequest {
	runId: string;
	edgeId: string;
	payload: unknown;
	mutation?: {
		mutationType: MutationType;
		originalPayload?: unknown;
		strategy?: string;
	};
}

export interface IngestTraceResponse {
	traceId: string;
	valid: boolean;
	violations: ContractViolation[];
}

export interface RunMetrics {
	runId: string;
	contractsChecked: number;
	violations: number;
	recovered: number;
	breaches: number;
	recoveryRate: number;
	avgLatencyMs: number;
}
