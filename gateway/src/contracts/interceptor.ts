import { randomUUID } from "node:crypto";
import type { z, ZodTypeAny } from "zod";
import {
	toViolations,
	type ContractViolation,
	type MutationType,
} from "./schemas.js";

export type { MutationType } from "./schemas.js";

export type DownstreamStatus = "HANDLED" | "FAILED" | "BYPASSED";

export interface TraceRecord {
	traceId: string;
	runId: string;
	edgeId: string;
	sourceNodeId: string;
	targetNodeId: string;
	mutationType: MutationType;
	strategy?: string;
	fuzzerFallback: boolean;
	originalPayload: unknown;
	perturbedPayload: unknown;
	contractViolated: boolean;
	violations: ContractViolation[];
	downstreamHandled: boolean;
	downstreamStatus: DownstreamStatus;
	caughtError?: string;
	durationMs: number;
	timestamp: string;
}

export interface PerturbContext {
	contractHint?: string;
}

export interface PerturbResult {
	mutatedPayload: unknown;
	mutationType: MutationType;
	strategy?: string;
	fallback?: boolean;
}

export interface FuzzerEngine {
	perturb(
		payload: unknown,
		schema: ZodTypeAny,
		mutationHint?: MutationType,
		context?: PerturbContext,
	): Promise<PerturbResult>;
}

export type AgentHandler<TInput, TOutput> = (input: TInput) => Promise<TOutput>;

export type TraceListener = (trace: TraceRecord) => void | Promise<void>;

export function deriveDownstreamStatus(args: {
	handled: boolean;
	mutationType: MutationType;
	contractViolated: boolean;
}): DownstreamStatus {
	if (!args.handled) return "FAILED";
	if (args.mutationType !== "NONE" && !args.contractViolated)
		return "BYPASSED";
	return "HANDLED";
}

export class ContractProxyInterceptor {
	private traces: TraceRecord[] = [];
	private listeners: TraceListener[] = [];

	constructor(private readonly fuzzer: FuzzerEngine) {}

	onTrace(listener: TraceListener): () => void {
		this.listeners.push(listener);
		return () => {
			this.listeners = this.listeners.filter(
				(l) => l !== listener,
			);
		};
	}

	getTraces(): readonly TraceRecord[] {
		return this.traces;
	}

	createEdgeProxy<TSchema extends ZodTypeAny, TOutput>(options: {
		runId: string;
		edgeId: string;
		sourceNodeId: string;
		targetNodeId: string;
		schema: TSchema;
		targetAgent: AgentHandler<z.infer<TSchema>, TOutput>;
		enableAdversarialMutation?: boolean;
		forcedMutationType?: MutationType;
		contractHint?: string;
	}): (payload: unknown) => Promise<TOutput> {
		const {
			runId,
			edgeId,
			sourceNodeId,
			targetNodeId,
			schema,
			targetAgent,
			enableAdversarialMutation = false,
			forcedMutationType,
			contractHint,
		} = options;

		return async (rawPayload: unknown): Promise<TOutput> => {
			const startTime = performance.now();
			const traceId = randomUUID();

			let activePayload = rawPayload;
			let mutationApplied: MutationType = "NONE";
			let strategy: string | undefined;
			let fuzzerFallback = false;

			if (enableAdversarialMutation) {
				const fuzzed = await this.fuzzer.perturb(
					rawPayload,
					schema,
					forcedMutationType,
					{ contractHint },
				);
				activePayload = fuzzed.mutatedPayload;
				mutationApplied = fuzzed.mutationType;
				strategy = fuzzed.strategy;
				fuzzerFallback = fuzzed.fallback ?? false;
			}

			const validation = schema.safeParse(activePayload);
			const contractViolated = !validation.success;
			const violations = validation.success
				? []
				: toViolations(validation.error.issues);

			let downstreamHandled = false;
			let caughtError: string | undefined;

			try {
				const response = await targetAgent(
					activePayload as z.infer<TSchema>,
				);
				downstreamHandled = true;
				return response;
			} catch (err: unknown) {
				caughtError =
					err instanceof Error
						? (err.stack ?? err.message)
						: String(err);
				throw err;
			} finally {
				const record: TraceRecord = {
					traceId,
					runId,
					edgeId,
					sourceNodeId,
					targetNodeId,
					mutationType: mutationApplied,
					strategy,
					fuzzerFallback,
					originalPayload: rawPayload,
					perturbedPayload: activePayload,
					contractViolated,
					violations,
					downstreamHandled,
					downstreamStatus:
						deriveDownstreamStatus({
							handled: downstreamHandled,
							mutationType:
								mutationApplied,
							contractViolated,
						}),
					caughtError,
					durationMs:
						Math.round(
							(performance.now() -
								startTime) *
								100,
						) / 100,
					timestamp: new Date().toISOString(),
				};

				this.traces.push(record);
				await Promise.allSettled(
					this.listeners.map((fn) => fn(record)),
				);
			}
		};
	}
}
