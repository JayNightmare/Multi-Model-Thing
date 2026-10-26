import { describe, expect, it } from "vitest";
import {
	ContractProxyInterceptor,
	deriveDownstreamStatus,
	type FuzzerEngine,
} from "../src/contracts/interceptor.js";
import { SynthesisContract } from "../src/contracts/schemas.js";

const valid = { confidence: 0.9, decision: "APPROVE", risk_score: 10 };

function makeProxy(fuzzer: FuzzerEngine, mutate: boolean) {
	const interceptor = new ContractProxyInterceptor(fuzzer);
	const proxy = interceptor.createEdgeProxy({
		runId: "run_test",
		edgeId: "synthesizer-decision-engine",
		sourceNodeId: "synthesizer",
		targetNodeId: "decision-engine",
		schema: SynthesisContract,
		targetAgent: async (input) => input.decision,
		enableAdversarialMutation: mutate,
	});
	return { interceptor, proxy };
}

describe("ContractProxyInterceptor", () => {
	it("passes a valid payload through and records a clean trace", async () => {
		const fuzzer: FuzzerEngine = {
			perturb: async () => {
				throw new Error("must not be called");
			},
		};
		const { interceptor, proxy } = makeProxy(fuzzer, false);
		await expect(proxy(valid)).resolves.toBe("APPROVE");
		const [trace] = interceptor.getTraces();
		expect(trace.contractViolated).toBe(false);
		expect(trace.downstreamStatus).toBe("HANDLED");
	});

	it("flags a mutated payload that breaks the contract", async () => {
		const fuzzer: FuzzerEngine = {
			perturb: async (payload) => ({
				mutatedPayload: {
					...(payload as object),
					confidence: "very high",
				},
				mutationType: "TYPE_SWAP",
			}),
		};
		const { interceptor, proxy } = makeProxy(fuzzer, true);
		await proxy(valid).catch(() => undefined);
		const [trace] = interceptor.getTraces();
		expect(trace.contractViolated).toBe(true);
		expect(trace.violations.length).toBeGreaterThan(0);
	});

	it("derives downstream status", () => {
		expect(
			deriveDownstreamStatus({
				handled: false,
				mutationType: "NONE",
				contractViolated: false,
			}),
		).toBe("FAILED");
		expect(
			deriveDownstreamStatus({
				handled: true,
				mutationType: "TYPE_SWAP",
				contractViolated: false,
			}),
		).toBe("BYPASSED");
	});
});
