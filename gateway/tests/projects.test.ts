import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ContractRegistry } from "../src/contracts/registry.js";
import { bearer, makeApp, signIn } from "./helpers.js";

const schema = {
	type: "object",
	properties: {
		claim: { type: "string", minLength: 1 },
		amount: { type: "integer", minimum: 0 },
	},
	required: ["claim", "amount"],
	additionalProperties: false,
};

const workflow = {
	agents: [
		{ id: "intake", name: "Intake" },
		{ id: "pricer", name: "Pricer", role: "Prices a claim" },
	],
	edges: [
		{
			id: "intake-pricer",
			source: "intake",
			target: "pricer",
			schema,
			baseline: { claim: "C-1", amount: 120 },
		},
	],
};

let app: FastifyInstance;
let alice: string;
let bob: string;

beforeAll(async () => {
	app = await makeApp();
	alice = await signIn(app, "alice");
	bob = await signIn(app, "bob");
});

afterAll(async () => {
	await app.close();
});

const call = (
	method: "GET" | "POST" | "PUT" | "DELETE",
	url: string,
	token: string,
	payload?: unknown,
) => app.inject({ method, url, headers: bearer(token), payload });

async function newProject(token: string, name = "Claims") {
	const res = await call("POST", "/v1/projects", token, { name });
	expect(res.statusCode).toBe(201);
	return res.json().projectId as string;
}

describe("ContractRegistry", () => {
	const registry = new ContractRegistry();

	it("reports violations with readable paths", () => {
		expect(
			registry.validate(schema, {
				claim: "",
				amount: "x",
				extra: 1,
			}),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "claim",
					code: "minLength",
				}),
				expect.objectContaining({
					path: "amount",
					code: "type",
				}),
				expect.objectContaining({
					path: "extra",
					code: "additionalProperties",
				}),
			]),
		);
		expect(
			registry.validate(schema, { claim: "C" })[0],
		).toMatchObject({
			path: "amount",
			code: "required",
		});
		expect(
			registry.validate(schema, { claim: "C", amount: 1 }),
		).toEqual([]);
	});

	it("refuses non-object roots, unknown keywords and remote references", () => {
		expect(() => registry.assertValid({ type: "string" })).toThrow(
			/"type": "object"/,
		);
		expect(() => registry.assertValid(true)).toThrow();
		expect(() =>
			registry.assertValid({ type: "object", wat: 1 }),
		).toThrow();
		expect(() =>
			registry.assertValid({
				type: "object",
				properties: {
					a: {
						$ref: "https://example.com/schema.json",
					},
				},
			}),
		).toThrow();
	});

	it("ignores $schema and $id so dialect keys cannot break compilation", () => {
		const draft = {
			$schema: "https://json-schema.org/draft/2020-12/schema",
			$id: "https://example.com/x",
			...schema,
		};
		expect(
			registry.validate(draft, { claim: "C", amount: 1 }),
		).toEqual([]);
	});
});

describe("projects and workflows", () => {
	it("lists the demo project for everyone and private projects for their owner", async () => {
		const id = await newProject(alice, "Alice only");
		const aliceList = (
			await call("GET", "/v1/projects", alice)
		).json().projects;
		expect(
			aliceList.map(
				(p: { projectId: string }) => p.projectId,
			),
		).toEqual(["demo", id]);
		const bobList = (await call("GET", "/v1/projects", bob)).json()
			.projects;
		expect(
			bobList.map((p: { projectId: string }) => p.projectId),
		).toEqual(["demo"]);

		for (const method of ["GET", "DELETE"] as const) {
			const url =
				method === "GET"
					? `/v1/projects/${id}/workflow`
					: `/v1/projects/${id}`;
			expect((await call(method, url, bob)).statusCode).toBe(
				404,
			);
		}
		expect(
			(await call("GET", `/v1/projects/${id}/topology`, bob))
				.statusCode,
		).toBe(404);
	});

	it("does not let anyone edit or delete the demo project", async () => {
		expect(
			(
				await call(
					"PUT",
					"/v1/projects/demo/workflow",
					alice,
					workflow,
				)
			).statusCode,
		).toBe(404);
		expect(
			(await call("DELETE", "/v1/projects/demo", alice))
				.statusCode,
		).toBe(404);
		const demo = await call(
			"GET",
			"/v1/projects/demo/topology",
			alice,
		);
		expect(demo.statusCode).toBe(200);
		expect(demo.json().edges).toHaveLength(3);
		expect(demo.json().edges[1].contractFields).toEqual(
			expect.arrayContaining([
				{
					field: "decision",
					expected: '"APPROVE" or "REJECT"',
				},
			]),
		);
	});

	it("validates and stores a workflow, then serves its topology", async () => {
		const id = await newProject(alice);
		const put = await call(
			"PUT",
			`/v1/projects/${id}/workflow`,
			alice,
			workflow,
		);
		expect(put.statusCode).toBe(200);
		expect(put.json().edges[0]).toMatchObject({
			id: "intake-pricer",
			label: "intake → pricer",
		});

		const topology = (
			await call("GET", `/v1/projects/${id}/topology`, alice)
		).json();
		expect(
			topology.agents.map((a: { id: string }) => a.id),
		).toEqual(["intake", "pricer"]);
		expect(topology.edges[0].contractFields).toEqual([
			{ field: "claim", expected: "non-empty string" },
			{ field: "amount", expected: "integer ≥ 0" },
		]);
	});

	it("rejects broken workflows with a reason", async () => {
		const id = await newProject(alice);
		const put = (body: unknown) =>
			call("PUT", `/v1/projects/${id}/workflow`, alice, body);
		const edge = workflow.edges[0];

		expect(
			(
				await put({
					...workflow,
					edges: [
						{
							...edge,
							schema: {
								type: "object",
								wat: 1,
							},
						},
					],
				})
			).statusCode,
		).toBe(422);
		expect(
			(
				await put({
					...workflow,
					edges: [{ ...edge, target: "ghost" }],
				})
			).json().error.message,
		).toMatch(/unknown agent "ghost"/);
		const badBaseline = await put({
			...workflow,
			edges: [{ ...edge, baseline: { claim: "C" } }],
		});
		expect(badBaseline.statusCode).toBe(422);
		expect(badBaseline.json().error.message).toMatch(
			/does not satisfy its contract/,
		);
		expect(
			(await put({ ...workflow, edges: [edge, edge] })).json()
				.error.message,
		).toMatch(/unique/);
		expect(
			(
				await put({
					...workflow,
					edges: [{ ...edge, id: "Bad Id" }],
				})
			).statusCode,
		).toBe(422);
	});
});

describe("assistant-driven runs", () => {
	// Stands in for the user's agent: it crashes unless amount is a number.
	const agent = (payload: { amount?: unknown }) =>
		typeof payload.amount === "number"
			? { handled: true, durationMs: 3 }
			: {
					handled: false,
					error: "TypeError: amount is not a number",
					durationMs: 1,
				};

	it("plans cases, records each outcome and summarises the run", async () => {
		const id = await newProject(alice);
		await call(
			"PUT",
			`/v1/projects/${id}/workflow`,
			alice,
			workflow,
		);

		const started = await call(
			"POST",
			`/v1/projects/${id}/runs`,
			alice,
			{
				fuzzerMode: "heuristic",
				seed: "fixed-seed",
			},
		);
		expect(started.statusCode).toBe(201);
		const { runId, totalCases, case: first } = started.json();
		expect(totalCases).toBe(5);
		expect(first).toMatchObject({
			caseId: "c1",
			edgeId: "intake-pricer",
			mutationType: "NONE",
			contractViolated: false,
		});

		// Asking again returns the same outstanding case.
		const again = await call(
			"POST",
			`/v1/runs/${runId}/next`,
			alice,
		);
		expect(again.json().case.caseId).toBe("c1");

		// Someone else's run looks like it does not exist.
		expect(
			(await call("POST", `/v1/runs/${runId}/next`, bob))
				.statusCode,
		).toBe(404);
		// Results must come back in order.
		const wrong = await call(
			"POST",
			`/v1/runs/${runId}/cases/c3/result`,
			alice,
			{ handled: true },
		);
		expect(wrong.statusCode).toBe(409);

		let step = started.json() as {
			case?: {
				caseId: string;
				payload: { amount?: unknown };
			};
			done?: boolean;
			summary?: Record<string, number>;
		};
		let reported = 0;
		while (step.case) {
			const res = await call(
				"POST",
				`/v1/runs/${runId}/cases/${step.case.caseId}/result`,
				alice,
				agent(step.case.payload),
			);
			expect(res.statusCode).toBe(200);
			step = res.json();
			reported += 1;
		}
		expect(reported).toBe(5);
		expect(step.done).toBe(true);
		expect(step.summary).toMatchObject({
			totalCases: 5,
			reported: 5,
			projectId: id,
		});

		const traces = (
			await call(
				"GET",
				`/v1/traces?projectId=${id}&runId=${runId}`,
				alice,
			)
		).json().traces;
		expect(traces).toHaveLength(5);
		const violated = traces.filter(
			(t: { contractViolated: boolean }) =>
				t.contractViolated,
		);
		const breaches = traces.filter(
			(t: { downstreamStatus: string }) =>
				t.downstreamStatus === "FAILED",
		);
		expect(step.summary).toMatchObject({
			violations: violated.length,
			breaches: breaches.length,
		});

		const runs = (
			await call("GET", `/v1/runs?projectId=${id}`, alice)
		).json().runs;
		expect(runs).toHaveLength(1);
		expect(runs[0]).toMatchObject({ runId, seed: "fixed-seed" });
		expect(runs[0].completedAt).not.toBeNull();

		// The finished run is gone, and bob cannot read its project.
		expect(
			(await call("POST", `/v1/runs/${runId}/next`, alice))
				.statusCode,
		).toBe(404);
		expect(
			(await call("GET", `/v1/runs?projectId=${id}`, bob))
				.statusCode,
		).toBe(404);
		expect(
			(await call("GET", `/v1/traces?projectId=${id}`, bob))
				.statusCode,
		).toBe(404);
	});

	it("replays the same payloads for the same seed", async () => {
		const id = await newProject(alice);
		await call(
			"PUT",
			`/v1/projects/${id}/workflow`,
			alice,
			workflow,
		);
		const payloads = async () => {
			const started = (
				await call(
					"POST",
					`/v1/projects/${id}/runs`,
					alice,
					{ seed: "same" },
				)
			).json();
			const seen: unknown[] = [started.case.payload];
			let step = started;
			while (step.case) {
				const res = await call(
					"POST",
					`/v1/runs/${started.runId}/cases/${step.case.caseId}/result`,
					alice,
					{ handled: true },
				);
				step = res.json();
				if (step.case) seen.push(step.case.payload);
			}
			return seen;
		};
		expect(await payloads()).toEqual(await payloads());
	});

	it("refuses runs for projects without edges, unknown edges and other people's projects", async () => {
		const id = await newProject(alice);
		expect(
			(
				await call(
					"POST",
					`/v1/projects/${id}/runs`,
					alice,
					{},
				)
			).statusCode,
		).toBe(422);
		await call(
			"PUT",
			`/v1/projects/${id}/workflow`,
			alice,
			workflow,
		);
		const unknown = await call(
			"POST",
			`/v1/projects/${id}/runs`,
			alice,
			{ edgeIds: ["ghost"] },
		);
		expect(unknown.json().error.code).toBe("UNKNOWN_EDGE");
		expect(
			(await call("POST", `/v1/projects/${id}/runs`, bob, {}))
				.statusCode,
		).toBe(404);
	});

	it("ingest checks project access and run ownership", async () => {
		const id = await newProject(alice);
		await call(
			"PUT",
			`/v1/projects/${id}/workflow`,
			alice,
			workflow,
		);
		const body = {
			projectId: id,
			runId: "ext-1",
			edgeId: "intake-pricer",
			payload: { claim: "C", amount: 1 },
		};
		const ok = await call("POST", "/v1/traces", alice, body);
		expect(ok.statusCode).toBe(201);
		expect(ok.json().valid).toBe(true);
		expect(
			(await call("POST", "/v1/traces", bob, body))
				.statusCode,
		).toBe(404);

		// Bob reuses a run id that already belongs to Alice in the demo project.
		const demo = {
			projectId: "demo",
			runId: "ext-demo",
			edgeId: "extractor-synthesizer",
			payload: {
				claim_id: "C",
				fields: ["a"],
				confidence: 1,
			},
		};
		expect(
			(await call("POST", "/v1/traces", alice, demo))
				.statusCode,
		).toBe(201);
		expect(
			(await call("POST", "/v1/traces", bob, demo))
				.statusCode,
		).toBe(409);
		// Alice's demo trace is invisible to Bob.
		const bobDemo = (
			await call(
				"GET",
				"/v1/traces?projectId=demo&runId=ext-demo",
				bob,
			)
		).json().traces;
		expect(bobDemo).toHaveLength(0);
	});

	it("deleting a project removes its runs and traces", async () => {
		const id = await newProject(alice);
		await call(
			"PUT",
			`/v1/projects/${id}/workflow`,
			alice,
			workflow,
		);
		await call("POST", "/v1/traces", alice, {
			projectId: id,
			runId: "gone",
			edgeId: "intake-pricer",
			payload: { claim: "C", amount: 1 },
		});
		expect(
			(await call("DELETE", `/v1/projects/${id}`, alice))
				.statusCode,
		).toBe(204);
		expect(
			(
				await call(
					"GET",
					`/v1/projects/${id}/workflow`,
					alice,
				)
			).statusCode,
		).toBe(404);
		const all = (await call("GET", "/v1/projects", alice)).json()
			.projects;
		expect(
			all.map((p: { projectId: string }) => p.projectId),
		).not.toContain(id);
	});
});
