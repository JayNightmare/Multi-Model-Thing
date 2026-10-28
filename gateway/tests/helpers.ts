import type { FastifyInstance } from "fastify";
import { loadConfig } from "../src/config.js";
import { buildServer } from "../src/server.js";
import { DuckDbTraceStore } from "../src/storage/duckdb.js";

export const ENV = {
	DUCKDB_PATH: ":memory:",
	LOG_LEVEL: "silent",
	FUZZER_URL: "http://127.0.0.1:1",
	JWT_SECRET: "x".repeat(40),
	GITHUB_CLIENT_ID: "cid",
	GITHUB_CLIENT_SECRET: "csecret",
	GITHUB_ALLOWED_USERS: "alice, bob",
	PUBLIC_URL: "https://gateway.test",
	STUDIO_URL: "https://studio.test",
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
		return Response.json({
			login: auth.replace("Bearer tok-", ""),
		});
	}
	return new Response("unexpected", { status: 500 });
};

export async function makeApp(): Promise<FastifyInstance> {
	const store = new DuckDbTraceStore(":memory:");
	await store.init();
	const app = await buildServer({
		config: loadConfig(ENV),
		store,
		fetch: fakeGithub,
	});
	await app.ready();
	return app;
}

/** Runs the whole GitHub sign-in and returns the web-session JWT for the login. */
export async function signIn(
	app: FastifyInstance,
	login: string,
): Promise<string> {
	const start = await app.inject({
		url: "/v1/auth/github/login",
		query: { accept: "1" },
	});
	const state = new URL(
		start.headers.location as string,
	).searchParams.get("state")!;
	const cookie = String(start.headers["set-cookie"]).split(";")[0];
	const back = await app.inject({
		url: "/v1/auth/github/callback",
		query: { code: `good-${login}`, state },
		headers: { cookie },
	});
	const code = new URL(back.headers.location as string).searchParams.get(
		"login_code",
	)!;
	const exchange = await app.inject({
		method: "POST",
		url: "/v1/auth/exchange",
		payload: { code },
	});
	return exchange.json().token as string;
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
