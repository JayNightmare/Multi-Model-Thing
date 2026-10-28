import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { executeSampleRun } from "../agents/sample-run.js";
import {
	ContractProxyInterceptor,
	type FuzzerEngine,
} from "../contracts/interceptor.js";
import {
	getEdge,
	type FuzzerMode,
	type MutationType,
} from "../contracts/schemas.js";
import { AppError } from "../errors.js";
import { seededRandom } from "../fuzzers/seed.js";
import type { TraceStore } from "../storage/duckdb.js";
import type { TelemetryBroadcaster } from "./broadcaster.js";

// Heuristic mode exercises every deterministic mutation; semantic mode maps 1:1 onto the three LLM strategies.
const MUTATIONS_BY_MODE: Record<FuzzerMode, MutationType[]> = {
	heuristic: [
		"TYPE_SWAP",
		"KEY_OMISSION",
		"BOUNDARY_OVERFLOW",
		"SEMANTIC_DRIFT",
	],
	semantic: ["TYPE_SWAP", "SEMANTIC_DRIFT", "KEY_OMISSION"],
};

export interface RunRequest {
	fuzzerMode: FuzzerMode;
	edgeId?: string;
	/** Replays a previous run's key choices; defaults to the new run id. */
	seed?: string;
}

export type FuzzerFactory = (
	random: () => number,
) => Record<FuzzerMode, FuzzerEngine>;

export class RunService {
	private active = false;

	constructor(
		private readonly deps: {
			store: TraceStore;
			broadcaster: TelemetryBroadcaster;
			createFuzzers: FuzzerFactory;
			log: FastifyBaseLogger;
		},
	) {}

	get isRunning(): boolean {
		return this.active;
	}

	async start(request: RunRequest): Promise<string> {
		if (request.edgeId !== undefined && !getEdge(request.edgeId)) {
			throw new AppError(
				"UNKNOWN_EDGE",
				`Unknown edge "${request.edgeId}"`,
				422,
			);
		}
		if (this.active)
			throw new AppError(
				"RUN_IN_PROGRESS",
				"A test run is already in progress",
				409,
			);

		this.active = true;
		const { store, broadcaster, log } = this.deps;
		const runId = randomUUID();
		const seed = request.seed ?? runId;
		const interceptor = new ContractProxyInterceptor(
			this.deps.createFuzzers(seededRandom(seed))[
				request.fuzzerMode
			],
		);

		try {
			await store.createRun({
				runId,
				workflowName: request.edgeId
					? `retest:${request.edgeId}`
					: "sample-claims-workflow",
				fuzzerMode: request.fuzzerMode,
				startedAt: new Date().toISOString(),
				seed,
			});
		} catch (err) {
			log.error(err, "Failed to persist run start");
		}

		broadcaster.broadcast({
			type: "RUN_STARTED",
			runId,
			timestamp: new Date().toISOString(),
			summary: {
				fuzzerMode: request.fuzzerMode,
				edgeId: request.edgeId,
				seed,
			},
		});

		interceptor.onTrace(async (trace) => {
			try {
				await store.saveTrace(trace);
			} catch (err) {
				log.error(err, "Failed to persist trace");
			}
			broadcaster.broadcast({
				type: "TRACE_EMITTED",
				runId,
				timestamp: trace.timestamp,
				trace,
			});
		});

		try {
			await executeSampleRun(interceptor, {
				runId,
				edgeId: request.edgeId,
				mutations: MUTATIONS_BY_MODE[
					request.fuzzerMode
				],
			});
		} finally {
			const completedAt = new Date().toISOString();
			try {
				await store.completeRun(runId, completedAt);
			} catch (err) {
				log.error(
					err,
					"Failed to persist run completion",
				);
			}
			broadcaster.broadcast({
				type: "RUN_COMPLETED",
				runId,
				timestamp: completedAt,
				summary: {
					totalTraces:
						interceptor.getTraces().length,
				},
			});
			this.active = false;
		}

		return runId;
	}
}
