import { describe, expect, it } from "vitest";
import { classifyEdgeHealth, summarizeTraces } from "../lib/metrics";
import type { TraceRecord } from "../types";

function trace(overrides: Partial<TraceRecord>): TraceRecord {
	return {
		traceId: "t",
		runId: "r",
		edgeId: "e1",
		contractViolated: false,
		downstreamStatus: "HANDLED",
		...overrides,
	} as TraceRecord;
}

describe("classifyEdgeHealth", () => {
	it("is red when any trace breached downstream", () => {
		expect(classifyEdgeHealth(1, 1)).toBe("red");
	});
	it("is amber for violations without breaches", () => {
		expect(classifyEdgeHealth(0, 2)).toBe("amber");
	});
	it("is green when clean", () => {
		expect(classifyEdgeHealth(0, 0)).toBe("green");
	});
});

describe("summarizeTraces", () => {
	it("aggregates per edge", () => {
		const [summary] = summarizeTraces([
			trace({}),
			trace({ contractViolated: true }),
			trace({
				contractViolated: true,
				downstreamStatus: "FAILED",
			}),
		]);
		expect(summary).toMatchObject({
			total: 3,
			passed: 1,
			violations: 2,
			recovered: 1,
			breached: 1,
			health: "red",
		});
	});
});
