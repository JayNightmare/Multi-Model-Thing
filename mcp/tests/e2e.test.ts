import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Credential, CredentialStore } from "../src/credentials.js";
import { createMmlServer } from "../src/server.js";
// The real gateway runs in-process, so these tests cover the MCP and the HTTP API together.
import { bearer, makeApp, signIn } from "../../gateway/tests/helpers.js";

const API = "https://gateway.test";

class MemoryCredentials implements CredentialStore {
	private map = new Map<string, Credential>();
	async get(url: string) {
		return this.map.get(url) ?? null;
	}
	async set(url: string, c: Credential) {
		this.map.set(url, c);
	}
	async delete(url: string) {
		this.map.delete(url);
	}
}

let app: FastifyInstance;
let aliceJwt: string;

beforeAll(async () => {
	app = await makeApp();
	aliceJwt = await signIn(app, "alice");
});

afterAll(async () => {
	await app.close();
});

// Routes fetch calls into the in-process gateway instead of the network.
const fetchImpl: typeof fetch = async (input, init) => {
	const url = new URL(String(input));
	const res = await app.inject({
		method: (init?.method ?? "GET") as "GET",
		url: url.pathname + url.search,
		headers: init?.headers as Record<string, string>,
		payload: init?.body as string | undefined,
	});
	const empty = res.statusCode === 204;
	return new Response(empty ? null : res.body, {
		status: res.statusCode,
		headers: res.headers as HeadersInit,
	});
};

async function connect(credentials = new MemoryCredentials()) {
	const server = createMmlServer({
		apiUrl: API,
		credentials,
		fetchImpl,
		sleep: async () => undefined,
	});
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: "test", version: "0" });
	await Promise.all([
		server.connect(serverSide),
		client.connect(clientSide),
	]);
	const call = async (
		name: string,
		args: Record<string, unknown> = {},
	) => {
		const res = (await client.callTool({
			name,
			arguments: args,
		})) as {
			isError?: boolean;
			content: { type: string; text: string }[];
		};
		return {
			isError: Boolean(res.isError),
			text: res.content.map((c) => c.text).join("\n"),
		};
	};
	return { client, call, credentials };
}

async function signInDevice(call: Awaited<ReturnType<typeof connect>>["call"]) {
	const login = await call("mml_login", { clientName: "Test editor" });
	expect(login.isError).toBe(false);
	const code = /Code: ([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(login.text)![1];
	const approve = await app.inject({
		method: "POST",
		url: "/v1/device/approve",
		headers: bearer(aliceJwt),
		payload: { code, approve: true },
	});
	expect(approve.statusCode).toBe(200);
	return call("mml_login_status", { waitSeconds: 0 });
}

describe("mml MCP server", () => {
	it("exposes the tools, resources and prompts", async () => {
		const { client } = await connect();
		const tools = (await client.listTools()).tools.map(
			(t) => t.name,
		);
		expect(tools).toEqual(
			expect.arrayContaining([
				"mml_login",
				"mml_login_status",
				"mml_logout",
				"mml_whoami",
				"mml_init",
				"mml_infer_schema",
				"mml_set_workflow",
				"mml_start_run",
				"mml_report_result",
				"mml_run_summary",
				"mml_dashboard_url",
			]),
		);
		expect(
			(await client.listResources()).resources.map(
				(r) => r.uri,
			),
		).toEqual(
			expect.arrayContaining([
				"mml://workflow",
				"mml://latest-run",
			]),
		);
		expect(
			(await client.listPrompts()).prompts.map((p) => p.name),
		).toEqual(
			expect.arrayContaining([
				"mml-define-contracts",
				"mml-run-pass",
			]),
		);
	});

	it("asks the user to sign in when there is no token", async () => {
		const { call } = await connect();
		const res = await call("mml_whoami");
		expect(res.isError).toBe(true);
		expect(res.text).toMatch(/mml_login/);
		expect((await call("mml_login_status")).text).toMatch(
			/Call mml_login first/,
		);
	});

	it("signs in through the device flow and stores the token", async () => {
		const { call, credentials } = await connect();
		const login = await call("mml_login");
		expect(login.text).toContain(
			"https://studio.test/connect?code=",
		);

		// Nobody has approved yet, so a short wait just reports that.
		expect(
			(await call("mml_login_status", { waitSeconds: 0 }))
				.text,
		).toMatch(/Still waiting/);

		const done = await signInDevice(call);
		expect(done.text).toMatch(/Signed in as alice/);
		const stored = await credentials.get(API);
		expect(stored?.token).toMatch(/^mml_/);
		expect((await call("mml_whoami")).text).toMatch(
			/alice \(mcp\)/,
		);

		const out = await call("mml_logout");
		expect(out.isError).toBe(false);
		expect(await credentials.get(API)).toBeNull();
		// The token was revoked server-side too.
		const reused = await app.inject({
			url: "/v1/projects",
			headers: bearer(stored!.token),
		});
		expect(reused.statusCode).toBe(401);
	});

	it("takes a workspace from nothing to a finished, summarised run", async () => {
		const { call, credentials } = await connect();
		await signInDevice(call);
		const ws = await mkdtemp(join(tmpdir(), "mml-ws-"));

		const init = await call("mml_init", {
			name: "Claims bot",
			workspacePath: ws,
		});
		expect(init.isError).toBe(false);
		expect(init.text).toMatch(/Created project "Claims bot"/);
		expect(init.text).toMatch(
			/https:\/\/studio\.test\/app\?project=p_/,
		);
		const again = await call("mml_init", { workspacePath: ws });
		expect(again.text).toMatch(/already set up/);

		const schema = JSON.parse(
			(
				await call("mml_infer_schema", {
					samples: [{ claim: "C-1", amount: 10 }],
				})
			).text,
		);
		const workflow = await call("mml_set_workflow", {
			workspacePath: ws,
			agents: [
				{ id: "intake", name: "Intake" },
				{ id: "pricer", name: "Pricer" },
			],
			edges: [
				{
					id: "intake-pricer",
					source: "intake",
					target: "pricer",
					schema,
					baseline: { claim: "C-1", amount: 10 },
				},
			],
		});
		expect(workflow.isError).toBe(false);
		expect(
			JSON.parse(
				await readFile(
					join(ws, ".mml", "workflow.json"),
					"utf8",
				),
			).edges,
		).toHaveLength(1);

		let step = await call("mml_start_run", {
			workspacePath: ws,
			fuzzerMode: "heuristic",
			seed: "e2e",
		});
		expect(step.text).toMatch(/started with 5 cases/);
		let reported = 0;
		while (!step.text.includes("finished:")) {
			const runId = /runId "([^"]+)"/.exec(step.text)![1];
			const caseId = /caseId "([^"]+)"/.exec(step.text)![1];
			const payload = JSON.parse(
				/unchanged:\n([\s\S]*?)\n\nThen call/.exec(
					step.text,
				)![1],
			);
			// The user's agent crashes unless amount is a number.
			const handled = typeof payload.amount === "number";
			step = await call("mml_report_result", {
				workspacePath: ws,
				runId,
				caseId,
				handled,
				error: handled
					? undefined
					: "TypeError: amount is not a number",
				durationMs: 4,
			});
			expect(step.isError).toBe(false);
			reported += 1;
		}
		expect(reported).toBe(5);
		expect(step.text).toMatch(/5\/5 cases reported/);
		expect(step.text).toMatch(
			/Saved \.mml\/runs\/.+\.json and \.mml\/latest\.md/,
		);

		const files = (await readdir(join(ws, ".mml"))).sort();
		expect(files).toEqual([
			".gitignore",
			"README.md",
			"config.json",
			"latest.md",
			"runs",
			"workflow.json",
		]);
		expect(
			await readFile(join(ws, ".mml", "latest.md"), "utf8"),
		).toMatch(/Recovery rate/);

		// Credentials never land in the workspace.
		for (const f of files) {
			if (f === "runs") continue;
			expect(
				await readFile(join(ws, ".mml", f), "utf8"),
			).not.toContain((await credentials.get(API))!.token);
		}

		const summary = await call("mml_run_summary", {
			workspacePath: ws,
		});
		expect(summary.text).toMatch(/intake-pricer/);
		const status = await call("mml_status", { workspacePath: ws });
		expect(status.text).toMatch(/1 edges/);
		const url = await call("mml_dashboard_url", {
			workspacePath: ws,
		});
		expect(url.text).toMatch(
			/^https:\/\/studio\.test\/app\?project=p_/,
		);
		await expect(
			stat(join(ws, ".mml", "runs")),
		).resolves.toBeTruthy();
	});

	it("relays gateway validation errors with their details", async () => {
		const { call } = await connect();
		await signInDevice(call);
		const ws = await mkdtemp(join(tmpdir(), "mml-ws-"));
		await call("mml_init", { workspacePath: ws });
		const res = await call("mml_set_workflow", {
			workspacePath: ws,
			agents: [
				{ id: "a", name: "A" },
				{ id: "b", name: "B" },
			],
			edges: [
				{
					id: "a-b",
					source: "a",
					target: "b",
					schema: {
						type: "object",
						properties: {
							n: { type: "integer" },
						},
						required: ["n"],
						additionalProperties: false,
					},
					baseline: { n: "not a number" },
				},
			],
		});
		expect(res.isError).toBe(true);
		expect(res.text).toMatch(/does not satisfy its contract/);
		expect(res.text).toMatch(/"path": "n"/);
		// Nothing was written for a rejected workflow.
		await expect(
			readFile(join(ws, ".mml", "workflow.json"), "utf8"),
		).rejects.toThrow();
	});

	it("tells the assistant to initialise before defining a workflow", async () => {
		const { call } = await connect();
		await signInDevice(call);
		const ws = await mkdtemp(join(tmpdir(), "mml-ws-"));
		const res = await call("mml_set_workflow", {
			workspacePath: ws,
			agents: [{ id: "a", name: "A" }],
			edges: [
				{
					id: "a-a",
					source: "a",
					target: "a",
					schema: { type: "object" },
					baseline: {},
				},
			],
		});
		expect(res.isError).toBe(true);
		expect(res.text).toMatch(/mml_init/);
	});
});
