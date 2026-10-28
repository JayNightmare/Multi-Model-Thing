import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildServer } from "../src/server.js";

const SECRET = "x".repeat(40);
let app: FastifyInstance;

async function login(password = "hunter2") {
	return app.inject({
		method: "POST",
		url: "/v1/auth/login",
		payload: { password },
	});
}

beforeAll(async () => {
	app = await buildServer({
		config: loadConfig({
			DUCKDB_PATH: ":memory:",
			LOG_LEVEL: "silent",
			FUZZER_URL: "http://127.0.0.1:1",
			AUTH_PASSWORD: "hunter2",
			JWT_SECRET: SECRET,
		}),
	});
	await app.ready();
});

afterAll(async () => {
	await app.close();
});

describe("loadConfig auth", () => {
	it("is disabled without AUTH_PASSWORD", () => {
		expect(loadConfig({}).auth.enabled).toBe(false);
	});

	it("requires a long JWT_SECRET when AUTH_PASSWORD is set", () => {
		expect(() =>
			loadConfig({ AUTH_PASSWORD: "p", JWT_SECRET: "short" }),
		).toThrow(/JWT_SECRET/);
	});
});

describe("gateway auth", () => {
	it("keeps health and status public", async () => {
		expect((await app.inject({ url: "/health" })).statusCode).toBe(
			200,
		);
		const status = await app.inject({ url: "/v1/auth/status" });
		expect(status.json()).toEqual({
			required: true,
			legalVersion: "1",
			methods: { github: false, password: true },
		});
	});

	it("reports a password session at /me", async () => {
		const { token } = (await login()).json();
		const me = await app.inject({
			url: "/v1/auth/me",
			headers: { authorization: `Bearer ${token}` },
		});
		expect(me.statusCode).toBe(200);
		expect(me.json()).toMatchObject({
			login: "studio",
			method: "password",
			terms: null,
		});
	});

	it("rejects requests without a token", async () => {
		const res = await app.inject({ url: "/v1/runs" });
		expect(res.statusCode).toBe(401);
		expect(res.json().error.code).toBe("UNAUTHORIZED");
	});

	it("rejects a forged token", async () => {
		const res = await app.inject({
			url: "/v1/runs",
			headers: { authorization: "Bearer not.a.jwt" },
		});
		expect(res.statusCode).toBe(401);
	});

	it("rejects a wrong password", async () => {
		expect((await login("nope")).statusCode).toBe(401);
	});

	it("accepts a valid token", async () => {
		const res = await login();
		expect(res.statusCode).toBe(200);
		const { token } = res.json();
		const ok = await app.inject({
			url: "/v1/runs",
			headers: { authorization: `Bearer ${token}` },
		});
		expect(ok.statusCode).toBe(200);
	});

	it("does not accept a telemetry ticket as an API token", async () => {
		const { token } = (await login()).json();
		const ticket = await app.inject({
			method: "POST",
			url: "/v1/auth/ws-ticket",
			headers: { authorization: `Bearer ${token}` },
			payload: {},
		});
		expect(ticket.statusCode).toBe(200);
		const res = await app.inject({
			url: "/v1/runs",
			headers: {
				authorization: `Bearer ${ticket.json().ticket}`,
			},
		});
		expect(res.statusCode).toBe(401);
	});

	it("rate-limits repeated failures", async () => {
		let last = 0;
		for (let i = 0; i < 7; i++)
			last = (await login("bad")).statusCode;
		expect(last).toBe(429);
	});
});
