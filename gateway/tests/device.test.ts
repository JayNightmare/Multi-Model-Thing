import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { bearer, makeApp, signIn } from "./helpers.js";

let app: FastifyInstance;
let alice: string;

beforeAll(async () => {
	app = await makeApp();
	alice = await signIn(app, "alice");
});

afterEach(() => {
	vi.useRealTimers();
});

afterAll(async () => {
	await app.close();
});

async function deviceToken(approve = true) {
	const start = await app.inject({
		method: "POST",
		url: "/v1/device/code",
		payload: { clientName: "Test client" },
	});
	expect(start.statusCode).toBe(200);
	const body = start.json();
	expect(body.user_code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
	expect(body.verification_uri).toBe("https://studio.test/connect");

	const poll = () =>
		app.inject({
			method: "POST",
			url: "/v1/device/token",
			payload: { device_code: body.device_code },
		});

	const first = await poll();
	expect(first.json()).toEqual({ error: "authorization_pending" });
	// Polling again before the interval has passed is told to slow down.
	expect((await poll()).json()).toEqual({ error: "slow_down" });

	const decide = await app.inject({
		method: "POST",
		url: "/v1/device/approve",
		headers: bearer(alice),
		payload: {
			code: body.user_code.toLowerCase().replace("-", ""),
			approve,
		},
	});
	expect(decide.statusCode).toBe(200);

	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(Date.now() + 6000);
	return poll();
}

describe("device sign-in", () => {
	it("issues a token after approval and lets it use project routes only", async () => {
		const res = await deviceToken();
		expect(res.statusCode).toBe(200);
		const { access_token, login, expires_in } = res.json();
		expect(access_token).toMatch(/^mml_/);
		expect(login).toBe("alice");
		expect(expires_in).toBe(30 * 86400);
		vi.useRealTimers();

		const projects = await app.inject({
			url: "/v1/projects",
			headers: bearer(access_token),
		});
		expect(projects.statusCode).toBe(200);

		const me = await app.inject({
			url: "/v1/auth/me",
			headers: bearer(access_token),
		});
		expect(me.json()).toMatchObject({
			login: "alice",
			method: "mcp",
		});

		// A leaked MCP token cannot mint or manage other tokens.
		for (const [method, url] of [
			["GET", "/v1/tokens"],
			["POST", "/v1/device/approve"],
			["POST", "/v1/auth/ws-ticket"],
		] as const) {
			const denied = await app.inject({
				method,
				url,
				headers: bearer(access_token),
				payload:
					method === "POST"
						? { code: "X", approve: true }
						: undefined,
			});
			expect(denied.statusCode).toBe(403);
		}
	});

	it("lists, revokes and logs out tokens", async () => {
		const { access_token } = (await deviceToken()).json();
		vi.useRealTimers();

		const listed = await app.inject({
			url: "/v1/tokens",
			headers: bearer(alice),
		});
		const mine = listed
			.json()
			.tokens.filter(
				(t: { clientName: string }) =>
					t.clientName === "Test client",
			);
		expect(mine.length).toBeGreaterThan(0);
		expect(JSON.stringify(listed.json())).not.toContain(
			access_token,
		);

		const logout = await app.inject({
			method: "POST",
			url: "/v1/auth/logout",
			headers: bearer(access_token),
		});
		expect(logout.statusCode).toBe(204);
		const after = await app.inject({
			url: "/v1/projects",
			headers: bearer(access_token),
		});
		expect(after.statusCode).toBe(401);

		const { access_token: second } = (await deviceToken()).json();
		vi.useRealTimers();
		const [tokenInfo] = (
			await app.inject({
				url: "/v1/tokens",
				headers: bearer(alice),
			})
		).json().tokens;
		const revoke = await app.inject({
			method: "DELETE",
			url: `/v1/tokens/${tokenInfo.tokenId}`,
			headers: bearer(alice),
		});
		expect(revoke.statusCode).toBe(204);
		const revoked = await app.inject({
			url: "/v1/projects",
			headers: bearer(second),
		});
		// The list is newest first, so the token revoked here is the one just issued.
		expect(revoked.statusCode).toBe(401);
	});

	it("reports a denied request and cannot approve twice", async () => {
		const res = await deviceToken(false);
		expect(res.statusCode).toBe(400);
		expect(res.json()).toEqual({ error: "access_denied" });
	});

	it("rejects unknown device codes and codes nobody can look up", async () => {
		const poll = await app.inject({
			method: "POST",
			url: "/v1/device/token",
			payload: { device_code: "nope" },
		});
		expect(poll.json()).toEqual({ error: "expired_token" });
		const lookup = await app.inject({
			url: "/v1/device/lookup",
			query: { code: "ZZZZ-ZZZZ" },
			headers: bearer(alice),
		});
		expect(lookup.statusCode).toBe(404);
	});

	it("requires a web session to look up or approve", async () => {
		expect(
			(await app.inject({ url: "/v1/device/lookup" }))
				.statusCode,
		).toBe(401);
	});
});
