import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import {
	deriveDownstreamStatus,
	type FuzzerEngine,
	type TraceRecord,
} from "../contracts/interceptor.js";
import {
	describeContract,
	type ContractRegistry,
} from "../contracts/registry.js";
import type {
	ContractViolation,
	FuzzerMode,
	MutationType,
} from "../contracts/schemas.js";
import { AppError } from "../errors.js";
import { seededRandom } from "../fuzzers/seed.js";
import { recoveryRate, type TraceStore } from "../storage/duckdb.js";
import type { EdgeRecord } from "../storage/projects.js";
import type { TelemetryBroadcaster } from "./broadcaster.js";
import { MUTATIONS_BY_MODE, type FuzzerFactory } from "./run-service.js";

export const MAX_CASES = 100;
const MAX_ACTIVE_PER_USER = 3;
const IDLE_MS = 30 * 60_000;

export interface RunCase {
	caseId: string;
	/** 1-based position in the run, with the total number of cases. */
	index: number;
	total: number;
	edgeId: string;
	label: string;
	sourceAgent: string;
	targetAgent: string;
	mutationType: MutationType;
	strategy: string | null;
	/** What the assistant must send to the target agent. */
	payload: unknown;
	originalPayload: unknown;
	contractViolated: boolean;
	violations: ContractViolation[];
}

export interface CaseResult {
	handled: boolean;
	error?: string;
	durationMs?: number;
}

export interface RunSummaryInfo {
	runId: string;
	projectId: string;
	totalCases: number;
	reported: number;
	violations: number;
	recovered: number;
	breaches: number;
	bypassed: number;
	recoveryRate: number;
}

interface Planned {
	caseId: string;
	edge: EdgeRecord;
	mutation?: MutationType;
}

interface Issued {
	case: RunCase;
	fuzzerFallback: boolean;
}

interface RunState {
	runId: string;
	projectId: string;
	owner: string;
	engine: FuzzerEngine;
	plan: Planned[];
	cursor: number;
	issued: Issued | null;
	reported: number;
	violations: number;
	recovered: number;
	breaches: number;
	bypassed: number;
	lastActivity: number;
}

export type Step =
	| { done: false; case: RunCase }
	| { done: true; summary: RunSummaryInfo };

/** Runs where an external assistant calls the user's agent: the gateway plans cases, the assistant reports outcomes. */
export class ProjectRunService {
	private runs = new Map<string, RunState>();
	private sweep: NodeJS.Timeout;

	constructor(
		private readonly deps: {
			store: TraceStore;
			broadcaster: TelemetryBroadcaster;
			registry: ContractRegistry;
			createFuzzers: FuzzerFactory;
			log: FastifyBaseLogger;
		},
	) {
		this.sweep = setInterval(() => void this.expireIdle(), 60_000);
		this.sweep.unref();
	}

	close(): void {
		clearInterval(this.sweep);
	}

	async start(opts: {
		projectId: string;
		owner: string;
		fuzzerMode: FuzzerMode;
		seed?: string;
		edgeIds?: string[];
	}): Promise<{
		runId: string;
		seed: string;
		totalCases: number;
		case: RunCase;
	}> {
		const { store, broadcaster } = this.deps;
		const active = [...this.runs.values()].filter(
			(r) => r.owner === opts.owner,
		).length;
		if (active >= MAX_ACTIVE_PER_USER) {
			throw new AppError(
				"RUN_IN_PROGRESS",
				`You already have ${MAX_ACTIVE_PER_USER} runs in progress. Finish them first.`,
				409,
			);
		}

		const { edges } = await store.projects.getWorkflow(
			opts.projectId,
		);
		if (edges.length === 0) {
			throw new AppError(
				"VALIDATION_ERROR",
				"This project has no edges. Define a workflow first.",
				422,
			);
		}
		const selected = opts.edgeIds
			? edges.filter((e) => opts.edgeIds!.includes(e.id))
			: edges;
		const unknown = (opts.edgeIds ?? []).filter(
			(id) => !edges.some((e) => e.id === id),
		);
		if (unknown.length > 0) {
			throw new AppError(
				"UNKNOWN_EDGE",
				`Unknown edge "${unknown[0]}"`,
				422,
				{ knownEdges: edges.map((e) => e.id) },
			);
		}
		if (selected.length === 0) {
			throw new AppError(
				"VALIDATION_ERROR",
				"No edges selected",
				422,
			);
		}

		const mutations = MUTATIONS_BY_MODE[opts.fuzzerMode];
		const plan: Planned[] = [];
		for (const edge of selected) {
			for (const mutation of [undefined, ...mutations]) {
				plan.push({
					caseId: `c${plan.length + 1}`,
					edge,
					mutation,
				});
			}
		}
		if (plan.length > MAX_CASES) {
			throw new AppError(
				"VALIDATION_ERROR",
				`A run is limited to ${MAX_CASES} cases (${plan.length} requested). Select fewer edges.`,
				422,
			);
		}

		const runId = randomUUID();
		const seed = opts.seed ?? runId;
		await store.createRun({
			runId,
			workflowName: "assistant-run",
			fuzzerMode: opts.fuzzerMode,
			startedAt: new Date().toISOString(),
			seed,
			projectId: opts.projectId,
			ownerLogin: opts.owner,
		});
		const state: RunState = {
			runId,
			projectId: opts.projectId,
			owner: opts.owner,
			engine: this.deps.createFuzzers(seededRandom(seed))[
				opts.fuzzerMode
			],
			plan,
			cursor: 0,
			issued: null,
			reported: 0,
			violations: 0,
			recovered: 0,
			breaches: 0,
			bypassed: 0,
			lastActivity: Date.now(),
		};
		this.runs.set(runId, state);
		broadcaster.broadcast(
			{
				type: "RUN_STARTED",
				runId,
				timestamp: new Date().toISOString(),
				projectId: opts.projectId,
				summary: { fuzzerMode: opts.fuzzerMode, seed },
			},
			opts.owner,
		);

		const first = await this.issue(state);
		return {
			runId,
			seed,
			totalCases: plan.length,
			case: first!.case,
		};
	}

	/** Returns the outstanding case again if it has not been reported yet. */
	async next(runId: string, owner: string): Promise<Step> {
		const state = this.find(runId, owner);
		state.lastActivity = Date.now();
		if (state.issued)
			return { done: false, case: state.issued.case };
		const issued = await this.issue(state);
		return issued
			? { done: false, case: issued.case }
			: { done: true, summary: await this.finish(state) };
	}

	async report(
		runId: string,
		owner: string,
		caseId: string,
		result: CaseResult,
	): Promise<Step> {
		const state = this.find(runId, owner);
		const issued = state.issued;
		if (!issued || issued.case.caseId !== caseId) {
			throw new AppError(
				"CONFLICT",
				issued
					? `Expected a result for case ${issued.case.caseId}`
					: "No case is waiting for a result",
				409,
			);
		}
		state.lastActivity = Date.now();
		const c = issued.case;
		const status = deriveDownstreamStatus({
			handled: result.handled,
			mutationType: c.mutationType,
			contractViolated: c.contractViolated,
		});
		const trace: TraceRecord = {
			traceId: randomUUID(),
			runId,
			edgeId: c.edgeId,
			sourceNodeId: c.sourceAgent,
			targetNodeId: c.targetAgent,
			mutationType: c.mutationType,
			strategy: c.strategy ?? undefined,
			fuzzerFallback: issued.fuzzerFallback,
			originalPayload: c.originalPayload,
			perturbedPayload: c.payload,
			contractViolated: c.contractViolated,
			violations: c.violations,
			downstreamHandled: result.handled,
			downstreamStatus: status,
			caughtError: result.error?.slice(0, 2000),
			durationMs:
				Math.round((result.durationMs ?? 0) * 100) /
				100,
			timestamp: new Date().toISOString(),
		};
		try {
			await this.deps.store.saveTrace(trace);
		} catch (err) {
			this.deps.log.error(err, "Failed to persist trace");
			throw new AppError(
				"SERVICE_UNAVAILABLE",
				"Trace storage is unavailable",
				503,
			);
		}

		state.issued = null;
		state.reported += 1;
		if (c.contractViolated) {
			state.violations += 1;
			if (status !== "FAILED") state.recovered += 1;
		}
		if (status === "FAILED") state.breaches += 1;
		if (status === "BYPASSED") state.bypassed += 1;
		this.deps.broadcaster.broadcast(
			{
				type: "TRACE_EMITTED",
				runId,
				timestamp: trace.timestamp,
				projectId: state.projectId,
				trace,
			},
			state.owner,
		);

		const following = await this.issue(state);
		return following
			? { done: false, case: following.case }
			: { done: true, summary: await this.finish(state) };
	}

	private find(runId: string, owner: string): RunState {
		const state = this.runs.get(runId);
		// Another user's run id looks the same as an unknown one.
		if (!state || state.owner !== owner) {
			throw new AppError(
				"NOT_FOUND",
				"Run not found or already finished",
				404,
			);
		}
		return state;
	}

	private async issue(state: RunState): Promise<Issued | null> {
		const planned = state.plan[state.cursor];
		if (!planned) return null;
		state.cursor += 1;
		const { edge, mutation } = planned;
		const original = structuredClone(edge.baseline);

		let payload: unknown = original;
		let mutationType: MutationType = "NONE";
		let strategy: string | null = null;
		let fuzzerFallback = false;
		if (mutation) {
			const hint =
				edge.contractHint ??
				describeContract(edge.schema)
					.map((f) => `${f.field}: ${f.expected}`)
					.join("; ");
			const r = await state.engine.perturb(
				structuredClone(original),
				z.any(),
				mutation,
				{ contractHint: hint },
			);
			payload = r.mutatedPayload;
			mutationType = r.mutationType;
			strategy = r.strategy ?? null;
			fuzzerFallback = r.fallback ?? false;
		}
		const violations = this.deps.registry.validate(
			edge.schema,
			payload,
		);
		state.issued = {
			fuzzerFallback,
			case: {
				caseId: planned.caseId,
				index: state.cursor,
				total: state.plan.length,
				edgeId: edge.id,
				label: edge.label,
				sourceAgent: edge.source,
				targetAgent: edge.target,
				mutationType,
				strategy,
				payload,
				originalPayload: original,
				contractViolated: violations.length > 0,
				violations,
			},
		};
		return state.issued;
	}

	private async finish(state: RunState): Promise<RunSummaryInfo> {
		this.runs.delete(state.runId);
		const completedAt = new Date().toISOString();
		try {
			await this.deps.store.completeRun(
				state.runId,
				completedAt,
			);
		} catch (err) {
			this.deps.log.error(
				err,
				"Failed to persist run completion",
			);
		}
		this.deps.broadcaster.broadcast(
			{
				type: "RUN_COMPLETED",
				runId: state.runId,
				timestamp: completedAt,
				projectId: state.projectId,
				summary: { totalTraces: state.reported },
			},
			state.owner,
		);
		return {
			runId: state.runId,
			projectId: state.projectId,
			totalCases: state.plan.length,
			reported: state.reported,
			violations: state.violations,
			recovered: state.recovered,
			breaches: state.breaches,
			bypassed: state.bypassed,
			recoveryRate: recoveryRate(
				state.recovered,
				state.violations,
			),
		};
	}

	private async expireIdle(): Promise<void> {
		const cutoff = Date.now() - IDLE_MS;
		for (const state of [...this.runs.values()]) {
			if (state.lastActivity < cutoff)
				await this.finish(state);
		}
	}
}
