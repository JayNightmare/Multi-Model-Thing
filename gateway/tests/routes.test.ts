import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildServer } from "../src/server.js";

let app: FastifyInstance;

beforeAll(async () => {
	const config = loadConfig({
		DUCKDB_PATH: ":memory:",
		LOG_LEVEL: "silent",
		// Nothing listens here, so the fuzzer reports as down.
		FUZZER_URL: "http://127.0.0.1:1",
	});
	app = await buildServer({ config });
	await app.ready();
});

afterAll(async () => {
	await app.close();
});

describe("gateway routes", () => {
	it("GET /health reports degraded (200) when only the fuzzer is down", async () => {
		const res = await app.inject({ method: "GET", url: "/health" });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toMatchObject({
			status: "degraded",
			duckdb: "up",
			fuzzer: "down",
		});
	});

	it("POST /v1/traces stores a valid trace", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/v1/traces",
			payload: {
				runId: "run_t1",
				edgeId: "synthesizer-decision-engine",
				payload: {
					confidence: 0.5,
					decision: "REJECT",
					risk_score: 3,
				},
			},
		});
		expect(res.statusCode).toBe(201);
		expect(res.json()).toMatchObject({
			valid: true,
			violations: [],
		});

		const list = await app.inject({
			method: "GET",
			url: "/v1/traces?runId=run_t1",
		});
		expect(list.json().traces).toHaveLength(1);
	});

	it("POST /v1/traces reports contract violations", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/v1/traces",
			payload: {
				runId: "run_t2",
				edgeId: "synthesizer-decision-engine",
				payload: { confidence: "very high" },
			},
		});
		expect(res.statusCode).toBe(201);
		expect(res.json().valid).toBe(false);
		expect(res.json().violations.length).toBeGreaterThan(0);
	});

	it("POST /v1/traces rejects an unknown edge with 422", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/v1/traces",
			payload: { runId: "r", edgeId: "nope", payload: {} },
		});
		expect(res.statusCode).toBe(422);
		expect(res.json().error.code).toBe("UNKNOWN_EDGE");
	});

	it("GET /v1/runs lists runs", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/v1/runs",
		});
		expect(res.statusCode).toBe(200);
		expect(Array.isArray(res.json().runs)).toBe(true);
	});
});
