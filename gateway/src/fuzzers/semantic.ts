import type { ZodTypeAny } from "zod";
import type {
	FuzzerEngine,
	PerturbContext,
	PerturbResult,
} from "../contracts/interceptor.js";
import type { MutationType } from "../contracts/schemas.js";
import { HeuristicFuzzer } from "./heuristic.js";

export type SemanticStrategy =
	| "INVERT_LOGIC"
	| "AMBIGUOUS_DRIFT"
	| "HALLUCINATE_CONSTRAINTS";

const STRATEGY_MAP: Partial<Record<MutationType, SemanticStrategy>> = {
	TYPE_SWAP: "INVERT_LOGIC",
	SEMANTIC_DRIFT: "AMBIGUOUS_DRIFT",
	KEY_OMISSION: "HALLUCINATE_CONSTRAINTS",
};

interface PerturbResponse {
	perturbed: unknown;
	strategy: string;
	mode: "llm" | "mock";
}

export interface FuzzerHealth {
	up: boolean;
	mode?: "llm" | "mock";
}

export class SemanticLocalFuzzer implements FuzzerEngine {
	constructor(
		private readonly baseUrl: string,
		private readonly fallback: FuzzerEngine = new HeuristicFuzzer(),
		private readonly timeoutMs = 15_000,
	) {}

	async perturb(
		payload: unknown,
		schema: ZodTypeAny,
		mutationHint?: MutationType,
		context?: PerturbContext,
	): Promise<PerturbResult> {
		const strategy =
			STRATEGY_MAP[mutationHint ?? "SEMANTIC_DRIFT"] ??
			"AMBIGUOUS_DRIFT";

		try {
			const res = await fetch(`${this.baseUrl}/v1/perturb`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					payload,
					strategy,
					contractHint: context?.contractHint,
				}),
				signal: AbortSignal.timeout(this.timeoutMs),
			});
			if (!res.ok)
				throw new Error(`Fuzzer HTTP ${res.status}`);

			const data = (await res.json()) as PerturbResponse;
			return {
				mutatedPayload: data.perturbed,
				mutationType: "SEMANTIC_DRIFT",
				strategy: data.strategy,
			};
		} catch {
			const result = await this.fallback.perturb(
				payload,
				schema,
				mutationHint,
				context,
			);
			return { ...result, fallback: true };
		}
	}

	async health(): Promise<FuzzerHealth> {
		try {
			const res = await fetch(`${this.baseUrl}/health`, {
				signal: AbortSignal.timeout(1_500),
			});
			if (!res.ok) return { up: false };
			const data = (await res.json()) as {
				mode?: "llm" | "mock";
			};
			return { up: true, mode: data.mode };
		} catch {
			return { up: false };
		}
	}
}
