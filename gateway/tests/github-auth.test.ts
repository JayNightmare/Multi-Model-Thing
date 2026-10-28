import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildServer } from "../src/server.js";
import { DuckDbTraceStore, type TraceStore } from "../src/storage/duckdb.js";

const ENV = {
	DUCKDB_PATH: ":memory:",
	LOG_LEVEL: "silent",
	FUZZER_URL: "http://127.0.0.1:1",
	JWT_SECRET: "x".repeat(40),
	GITHUB_CLIENT_ID: "cid",
	GITHUB_CLIENT_SECRET: "csecret",
	GITHUB_ALLOWED_USERS: "Octocat, someone-else",
	PUBLIC_URL: "https://gateway.test",
	STUDIO_URL: "https://studio.test/",
};

// Pretends to be GitHub: the code "good-<login>" resolves to that login.
const fakeGithub: typeof fetch = async (input, init) => {
	const url = String(input);
	if (url === "https://github.com/login/oauth/access_token") {
		const { code } = JSON.parse(String(init?.body)) as {
			code: string;
		};
		return Response.json(
			code.startsWith("good-")
				? { access_token: `tok-${code.slice(5)}` }
				: { error: "bad_verification_code" },
		);
	}
	if (url === "https://api.github.com/user") {
		const auth =
			new Headers(init?.headers).get("authorization") ?? "";
		const login = auth.replace("Bearer tok-", "");
		return Response.json({
			login,
			name: `${login} Name`,
			avatar_url: `https://avatars.githubusercontent.com/u/1?v=${login}`,
		});
	}
	return new Response("unexpected", { status: 500 });
};

let app: FastifyInstance;
let store: TraceStore;

beforeAll(async () => {
	store = new DuckDbTraceStore(":memory:");
	await store.init();
	app = await buildServer({
		config: loadConfig(ENV),
		store,
		fetch: fakeGithub,
	});
	await app.ready();
});

afterAll(async () => {
	await app.close();
});

async function startFlow(accept = "1") {
	const res = await app.inject({
		url: "/v1/auth/github/login",
		query: { accept },
	});
	const location = new URL(res.headers.location as string);
	const cookie = String(res.headers["set-cookie"]).split(";")[0];
	return {
		res,
		location,
		cookie,
		state: location.searchParams.get("state")!,
	};
}

async function callback(
	code: string,
	opts: { cookie?: string; state?: string } = {},
) {
	const flow = await startFlow();
	const res = await app.inject({
		url: "/v1/auth/github/callback",
		query: { code, state: opts.state ?? flow.state },
		headers: { cookie: opts.cookie ?? flow.cookie },
	});
	return new URL(res.headers.location as string);
}

describe("loadConfig github", () => {
	it("requires an allowlist, secret and URLs", () => {
		expect(() =>
			loadConfig({ ...ENV, GITHUB_ALLOWED_USERS: "" }),
		).toThrow(/GITHUB_ALLOWED_USERS/);
		expect(() =>
			loadConfig({ ...ENV, GITHUB_CLIENT_SECRET: "" }),
		).toThrow(/GITHUB_CLIENT_SECRET/);
		expect(() => loadConfig({ ...ENV, STUDIO_URL: "" })).toThrow(
			/STUDIO_URL/,
		);
	});

	it("lower-cases logins and trims trailing slashes", () => {
		const { github } = loadConfig(ENV).auth;
		expect(github?.allowedUsers).toEqual([
			"octocat",
			"someone-else",
		]);
		expect(github?.studioUrl).toBe("https://studio.test");
	});

	it("treats * as any GitHub account", () => {
		const { github } = loadConfig({ ...ENV, GITHUB_ALLOWED_USERS: "*" }).auth;
		expect(github?.allowedUsers).toBeNull();
	});
});

describe("GitHub sign-in", () => {
	it("advertises GitHub only", async () => {
		const res = await app.inject({ url: "/v1/auth/status" });
		expect(res.json()).toEqual({
			required: true,
			legalVersion: "1",
			studioUrl: "https://studio.test",
			methods: { github: true, password: false },
		});
		const login = await app.inject({
			method: "POST",
			url: "/v1/auth/login",
			payload: { password: "x" },
		});
		expect(login.statusCode).toBe(404);
	});

	it("redirects to GitHub with state and a nonce cookie", async () => {
		const { res, location, cookie } = await startFlow();
		expect(res.statusCode).toBe(302);
		expect(location.origin + location.pathname).toBe(
			"https://github.com/login/oauth/authorize",
		);
		expect(location.searchParams.get("client_id")).toBe("cid");
		expect(location.searchParams.get("redirect_uri")).toBe(
			"https://gateway.test/v1/auth/github/callback",
		);
		expect(cookie).toMatch(/^oauth_nonce=[0-9a-f]{32}$/);
		expect(String(res.headers["set-cookie"])).toMatch(
			/HttpOnly.*Secure/,
		);
	});

	it("signs in an allowed user and issues a working JWT via a one-time code", async () => {
		const back = await callback("good-Octocat");
		expect(back.origin).toBe("https://studio.test");
		expect(back.pathname).toBe("/signin");
		const code = back.searchParams.get("login_code")!;
		expect(code).toBeTruthy();

		const exchange = await app.inject({
			method: "POST",
			url: "/v1/auth/exchange",
			payload: { code },
		});
		expect(exchange.statusCode).toBe(200);
		expect(exchange.json().user).toBe("Octocat");

		const runs = await app.inject({
			url: "/v1/runs",
			headers: {
				authorization: `Bearer ${exchange.json().token}`,
			},
		});
		expect(runs.statusCode).toBe(200);

		const reuse = await app.inject({
			method: "POST",
			url: "/v1/auth/exchange",
			payload: { code },
		});
		expect(reuse.statusCode).toBe(401);
	});

	it("rejects GitHub users that are not on the allowlist", async () => {
		const back = await callback("good-stranger");
		expect(back.searchParams.get("login_error")).toBe(
			"not_allowed",
		);
		expect(back.searchParams.has("login_code")).toBe(false);
	});

	it("rejects a callback without the matching cookie or with a bad state", async () => {
		const noCookie = await callback("good-octocat", {
			cookie: "oauth_nonce=nope",
		});
		expect(noCookie.searchParams.get("login_error")).toBe("state");
		const forged = await callback("good-octocat", {
			state: "forged",
		});
		expect(forged.searchParams.get("login_error")).toBe("state");
	});

	it("reports a rejected GitHub code", async () => {
		const back = await callback("bad-code");
		expect(back.searchParams.get("login_error")).toBe("github");
	});

	it("keeps protecting every other route", async () => {
		expect((await app.inject({ url: "/v1/runs" })).statusCode).toBe(
			401,
		);
	});

	it("refuses to start sign-in without accepting the current terms", async () => {
		for (const query of [{}, { accept: "0" }]) {
			const res = await app.inject({
				url: "/v1/auth/github/login",
				query,
			});
			const back = new URL(res.headers.location as string);
			expect(back.origin).toBe("https://studio.test");
			expect(back.searchParams.get("login_error")).toBe(
				"terms",
			);
			expect(res.headers["set-cookie"]).toBeUndefined();
		}
	});

	it("records acceptance once per version and reports the profile at /me", async () => {
		for (let i = 0; i < 2; i++) {
			const back = await callback("good-someone-else");
			const code = back.searchParams.get("login_code")!;
			const exchange = await app.inject({
				method: "POST",
				url: "/v1/auth/exchange",
				payload: { code },
			});
			const me = await app.inject({
				url: "/v1/auth/me",
				headers: {
					authorization: `Bearer ${exchange.json().token}`,
				},
			});
			expect(me.statusCode).toBe(200);
			expect(me.json()).toMatchObject({
				login: "someone-else",
				name: "someone-else Name",
				avatarUrl: expect.stringContaining(
					"https://avatars.githubusercontent.com/",
				),
				method: "github",
				terms: { version: "1" },
			});
			expect(me.json().expiresAt).toBeTruthy();
		}
		const first = await store.latestAcceptance("Someone-Else");
		await callback("good-someone-else");
		expect(await store.latestAcceptance("someone-else")).toEqual(
			first,
		);
	});

	it("requires a token for /me", async () => {
		expect(
			(await app.inject({ url: "/v1/auth/me" })).statusCode,
		).toBe(401);
	});
});
