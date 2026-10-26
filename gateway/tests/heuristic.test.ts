import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HeuristicFuzzer } from "../src/fuzzers/heuristic.js";

const schema = z.object({});

describe("HeuristicFuzzer", () => {
	it("omits a key for KEY_OMISSION without mutating the input", async () => {
		const input = { a: 1, b: "x" };
		const fuzzer = new HeuristicFuzzer(() => 0);
		const result = await fuzzer.perturb(
			input,
			schema,
			"KEY_OMISSION",
		);
		expect(result.mutationType).toBe("KEY_OMISSION");
		expect(result.mutatedPayload).toEqual({ b: "x" });
		expect(input).toEqual({ a: 1, b: "x" });
	});

	it("swaps a number to a string for TYPE_SWAP", async () => {
		const fuzzer = new HeuristicFuzzer(() => 0);
		const result = await fuzzer.perturb(
			{ n: 5 },
			schema,
			"TYPE_SWAP",
		);
		expect(result.mutatedPayload).toEqual({ n: "5" });
	});

	it("returns non-object payloads unchanged as NONE", async () => {
		const fuzzer = new HeuristicFuzzer();
		const result = await fuzzer.perturb("text", schema);
		expect(result).toMatchObject({
			mutatedPayload: "text",
			mutationType: "NONE",
		});
	});
});
