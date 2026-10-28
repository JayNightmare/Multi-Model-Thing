import { describe, expect, it } from "vitest";
import { seededRandom } from "../src/fuzzers/seed.js";
import { HeuristicFuzzer } from "../src/fuzzers/heuristic.js";
import { RunService } from "../src/services/run-service.js";
import { TelemetryBroadcaster } from "../src/services/broadcaster.js";
import {
	DuckDbTraceStore,
	recoveryRate,
	type StoredTrace,
} from "../src/storage/duckdb.js";

async function makeService() {
	const store = new DuckDbTraceStore(":memory:");
	await store.init();
	const broadcaster = new TelemetryBroadcaster();
	const service = new RunService({
		store,
		broadcaster,
		createFuzzers: (random) => {
			const heuristic = new HeuristicFuzzer(random);
			return { heuristic, semantic: heuristic };
		},
		log: { error: () => undefined } as never,
	});
	return { store, broadcaster, service };
}

const payloads = (traces: StoredTrace[]) =>
	traces
		.map((t) => [
			t.edgeId,
			t.mutationType,
			JSON.stringify(t.perturbedPayload),
		])
		.sort((a, b) => a.join("|").localeCompare(b.join("|")));

describe("seededRandom", () => {
	it("repeats for the same seed and stays in [0, 1)", () => {
		const a = seededRandom("seed-1");
		const b = seededRandom("seed-1");
		const first = Array.from({ length: 20 }, () => a());
		expect(first).toEqual(Array.from({ length: 20 }, () => b()));
		expect(first.every((x) => x >= 0 && x < 1)).toBe(true);
		expect(first).not.toEqual(
			Array.from({ length: 20 }, seededRandom("seed-2")),
		);
	});
});

describe("recoveryRate", () => {
	it("is recovered / violations, 100 with no violations", () => {
		expect(recoveryRate(2, 3)).toBe(66.7);
		expect(recoveryRate(0, 0)).toBe(100);
	});
});

describe("RunService", () => {
	it("replays identical payloads for the same seed and stores it", async () => {
		const { store, broadcaster, service } = await makeService();
		const first = await service.start({
			fuzzerMode: "heuristic",
			seed: "replay-me",
			owner: "tester",
		});
		const second = await service.start({
			fuzzerMode: "heuristic",
			seed: "replay-me",
			owner: "tester",
		});

		expect(
			payloads(await store.listTraces({ runId: first })),
		).toEqual(payloads(await store.listTraces({ runId: second })));
		const runs = await store.listRuns({
			projectId: "demo",
			viewer: "tester",
		});
		expect(runs.map((r) => r.seed)).toEqual([
			"replay-me",
			"replay-me",
		]);

		broadcaster.destroy();
		await store.close();
	});

	it("persists a recovery rate of recovered / violations", async () => {
		const { store, broadcaster, service } = await makeService();
		const runId = await service.start({
			fuzzerMode: "heuristic",
			owner: "tester",
		});
		const traces = await store.listTraces({ runId });
		const violated = traces.filter((t) => t.contractViolated);
		const recovered = violated.filter(
			(t) => t.downstreamStatus !== "FAILED",
		);

		const [run] = await store.listRuns({
			projectId: "demo",
			viewer: "tester",
		});
		expect(run.seed).toBe(runId);
		expect(run.recoveryRate).toBe(
			recoveryRate(recovered.length, violated.length),
		);

		broadcaster.destroy();
		await store.close();
	});
});
