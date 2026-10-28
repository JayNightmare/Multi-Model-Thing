import { randomBytes } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { AppError } from "../errors.js";
import {
	authorizeUrl,
	fetchGithubLogin,
	type GithubProfile,
} from "../github.js";

const Login = z.object({ password: z.string().min(1).max(256) });
const Exchange = z.object({ code: z.string().min(1).max(256) });

const MAX_FAILURES = 5;
const WINDOW_MS = 60_000;
const NONCE_COOKIE = "oauth_nonce";
const COOKIE_PATH = "/v1/auth/github";

function readCookie(request: FastifyRequest, name: string): string | undefined {
	for (const part of (request.headers.cookie ?? "").split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key === name) return rest.join("=");
	}
	return undefined;
}

function setNonceCookie(
	reply: FastifyReply,
	value: string,
	secure: boolean,
	maxAge: number,
): void {
	void reply.header(
		"Set-Cookie",
		`${NONCE_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=${COOKIE_PATH}; Max-Age=${maxAge}${secure ? "; Secure" : ""}`,
	);
}

export const authRoutes: FastifyPluginAsync<{ ctx: AppContext }> = async (
	app,
	{ ctx },
) => {
	const { auth } = ctx;
	const github = auth.github;
	const failures = new Map<string, { count: number; resetAt: number }>();

	// Shared by password login and code exchange: 5 failures per minute per IP.
	const assertNotLimited = (
		request: FastifyRequest,
		reply: FastifyReply,
	) => {
		const now = Date.now();
		const entry = failures.get(request.ip);
		if (
			entry &&
			entry.resetAt > now &&
			entry.count >= MAX_FAILURES
		) {
			void reply.header(
				"Retry-After",
				Math.ceil((entry.resetAt - now) / 1000),
			);
			throw new AppError(
				"RATE_LIMITED",
				"Too many failed attempts",
				429,
			);
		}
	};
	const recordFailure = (request: FastifyRequest) => {
		const now = Date.now();
		const entry = failures.get(request.ip);
		const current =
			entry && entry.resetAt > now
				? entry
				: { count: 0, resetAt: now + WINDOW_MS };
		failures.set(request.ip, {
			...current,
			count: current.count + 1,
		});
	};

	app.get("/v1/auth/status", async () => ({
		required: auth.enabled,
		legalVersion: ctx.config.legalVersion,
		studioUrl: github?.studioUrl ?? null,
		methods: {
			github: github !== null,
			password: auth.passwordEnabled,
		},
	}));

	// The studio shows who is signed in; the profile comes from claims set at sign-in.
	app.get("/v1/auth/me", async (request) => {
		const user = request.user;
		if (!user) {
			throw new AppError(
				"UNAUTHORIZED",
				"Missing or invalid token",
				401,
			);
		}
		if (user.via === "local") {
			return {
				login: "local",
				name: null,
				avatarUrl: null,
				method: "none",
				issuedAt: null,
				expiresAt: null,
				terms: null,
			};
		}
		if (user.via === "mcp") {
			return {
				login: user.login,
				name: null,
				avatarUrl: null,
				method: "mcp",
				issuedAt: null,
				expiresAt:
					user.tokenExpiresAt?.toISOString() ??
					null,
				terms: await ctx.store.latestAcceptance(
					user.login,
				),
			};
		}
		const claims = user.claims ?? {};
		const isGithub = claims.via === "github";
		const iso = (seconds: unknown) =>
			typeof seconds === "number"
				? new Date(seconds * 1000).toISOString()
				: null;
		return {
			login: user.login,
			name:
				typeof claims.name === "string"
					? claims.name
					: null,
			avatarUrl:
				typeof claims.avatar === "string"
					? claims.avatar
					: null,
			method: isGithub ? "github" : "password",
			issuedAt: iso(claims.iat),
			expiresAt: iso(claims.exp),
			terms: isGithub
				? await ctx.store.latestAcceptance(user.login)
				: null,
		};
	});

	// Lets an MCP client revoke its own token when the user signs out there.
	app.post("/v1/auth/logout", async (request, reply) => {
		const user = request.user;
		if (user?.via === "mcp" && user.tokenId) {
			await ctx.store.tokens.revoke(user.login, user.tokenId);
		}
		return reply.code(204).send();
	});

	app.post("/v1/auth/login", async (request, reply) => {
		if (!auth.passwordEnabled) {
			throw new AppError(
				"NOT_FOUND",
				"Password login is not enabled",
				404,
			);
		}
		assertNotLimited(request, reply);

		const body = Login.safeParse(request.body);
		if (!body.success || !auth.checkPassword(body.data.password)) {
			recordFailure(request);
			throw new AppError(
				"UNAUTHORIZED",
				"Invalid credentials",
				401,
			);
		}

		failures.delete(request.ip);
		return { ...(await auth.issue("api")), tokenType: "Bearer" };
	});

	if (github) {
		const secureCookie = github.publicUrl.startsWith("https://");
		const toStudio = (reply: FastifyReply, query: string) =>
			reply.redirect(
				`${github.studioUrl}/signin?${query}`,
				302,
			);

		app.get("/v1/auth/github/login", async (request, reply) => {
			// Signing in means accepting the current Terms and Privacy Policy.
			const { accept } = request.query as { accept?: string };
			if (accept !== ctx.config.legalVersion) {
				return toStudio(reply, "login_error=terms");
			}
			const nonce = randomBytes(16).toString("hex");
			setNonceCookie(reply, nonce, secureCookie, 600);
			return reply.redirect(
				authorizeUrl(
					github,
					await auth.issueOAuthState(
						nonce,
						ctx.config.legalVersion,
					),
				),
				302,
			);
		});

		app.get("/v1/auth/github/callback", async (request, reply) => {
			const { code, state, error } = request.query as Record<
				string,
				string | undefined
			>;
			const cookieNonce = readCookie(request, NONCE_COOKIE);
			setNonceCookie(reply, "", secureCookie, 0);

			// The state JWT proves we issued it; the cookie proves this browser started the flow.
			const verified = state
				? await auth.verifyOAuthState(state)
				: null;
			if (
				!verified ||
				!cookieNonce ||
				verified.nonce !== cookieNonce
			) {
				return toStudio(reply, "login_error=state");
			}
			if (error || !code)
				return toStudio(reply, "login_error=denied");

			let profile: GithubProfile;
			try {
				profile = await fetchGithubLogin(
					github,
					code,
					auth.fetchImpl,
				);
			} catch (err) {
				request.log.warn(
					{ err: (err as Error).message },
					"GitHub sign-in failed",
				);
				return toStudio(reply, "login_error=github");
			}
			const login = profile.login;
			if (
				github.allowedUsers &&
				!github.allowedUsers.includes(
					login.toLowerCase(),
				)
			) {
				request.log.warn(
					{ login },
					"GitHub user not on the allowlist",
				);
				return toStudio(
					reply,
					"login_error=not_allowed",
				);
			}
			try {
				await ctx.store.recordAcceptance(
					login,
					verified.legalVersion,
				);
			} catch (err) {
				request.log.error(
					err,
					"Failed to record terms acceptance",
				);
				return toStudio(reply, "login_error=server");
			}
			request.log.info({ login }, "GitHub sign-in succeeded");
			return toStudio(
				reply,
				`login_code=${encodeURIComponent(auth.createLoginCode(profile))}`,
			);
		});

		app.post("/v1/auth/exchange", async (request, reply) => {
			assertNotLimited(request, reply);
			const body = Exchange.safeParse(request.body);
			const profile = body.success
				? auth.redeemLoginCode(body.data.code)
				: null;
			if (!profile) {
				recordFailure(request);
				throw new AppError(
					"UNAUTHORIZED",
					"Invalid or expired code",
					401,
				);
			}
			return {
				...(await auth.issue("api", profile.login, {
					via: "github",
					name: profile.name,
					avatar: profile.avatarUrl,
				})),
				tokenType: "Bearer",
				user: profile.login,
			};
		});
	}

	app.post("/v1/auth/ws-ticket", async (request) => {
		const { token, expiresAt } = await auth.issue(
			"telemetry",
			request.user?.login ?? "local",
		);
		return { ticket: token, expiresAt };
	});

	// Drop expired entries so the map cannot grow unbounded.
	const sweep = setInterval(() => {
		const now = Date.now();
		for (const [ip, entry] of failures)
			if (entry.resetAt <= now) failures.delete(ip);
	}, WINDOW_MS);
	sweep.unref();
	app.addHook("onClose", async () => clearInterval(sweep));
};
