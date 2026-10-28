import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import type { AuthConfig, GithubAuthConfig } from "./config.js";
import { DeviceFlow } from "./device.js";
import { AppError } from "./errors.js";
import type { GithubProfile } from "./github.js";
import type { TokenRepo } from "./storage/tokens.js";

/** Who a request acts as: a web session (jwt), an MCP token (mcp) or dev mode without auth (local). */
export interface AuthUser {
	login: string;
	via: "jwt" | "mcp" | "local";
	claims?: Record<string, unknown>;
	tokenId?: string;
	tokenExpiresAt?: Date;
}

declare module "fastify" {
	interface FastifyRequest {
		user?: AuthUser;
	}
}

export const TOKEN_PREFIX = "mml_";

export function generateApiToken(): string {
	return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashApiToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

// MCP tokens are narrower than web sessions: they cannot mint or revoke other tokens.
const MCP_PATHS = [
	"/v1/projects",
	"/v1/runs",
	"/v1/traces",
	"/v1/auth/me",
	"/v1/auth/logout",
];

const allowedForMcp = (path: string) =>
	MCP_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

// "api" tokens authorize REST calls, "telemetry" tickets are short-lived and only open the WebSocket,
// and "oauth-state" binds a GitHub round trip to the browser that started it.
export type TokenAudience = "api" | "telemetry" | "oauth-state";

const ISSUER = "contract-gateway";
const WS_TICKET_TTL_SECONDS = 30;
const OAUTH_STATE_TTL_SECONDS = 600;
const LOGIN_CODE_TTL_MS = 60_000;
const PUBLIC_PATHS = new Set([
	"/health",
	"/openapi.json",
	"/v1/auth/status",
	"/v1/auth/login",
	"/v1/auth/exchange",
	"/v1/auth/github/login",
	"/v1/auth/github/callback",
	"/v1/device/code",
	"/v1/device/token",
]);

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export interface IssuedToken {
	token: string;
	expiresAt: string;
}

export class AuthService {
	private readonly key: Uint8Array;
	readonly device = new DeviceFlow();
	private readonly loginCodes = new Map<
		string,
		{ profile: GithubProfile; expiresAt: number }
	>();

	constructor(
		private readonly config: AuthConfig,
		readonly fetchImpl: typeof fetch = fetch,
	) {
		this.key = new TextEncoder().encode(config.jwtSecret);
	}

	get enabled(): boolean {
		return this.config.enabled;
	}

	get passwordEnabled(): boolean {
		return this.config.password !== "";
	}

	get github(): GithubAuthConfig | null {
		return this.config.github;
	}

	checkPassword(candidate: string): boolean {
		if (!this.passwordEnabled) return false;
		return timingSafeEqual(
			sha256(candidate),
			sha256(this.config.password),
		);
	}

	issue(
		audience: TokenAudience,
		subject = "studio",
		claims: Record<string, unknown> = {},
	): Promise<IssuedToken> {
		const ttl =
			audience === "telemetry"
				? WS_TICKET_TTL_SECONDS
				: audience === "oauth-state"
					? OAUTH_STATE_TTL_SECONDS
					: this.config.ttlSeconds;
		const expiresAt = Math.floor(Date.now() / 1000) + ttl;
		return new SignJWT(claims)
			.setProtectedHeader({ alg: "HS256" })
			.setIssuer(ISSUER)
			.setAudience(audience)
			.setSubject(subject)
			.setIssuedAt()
			.setExpirationTime(expiresAt)
			.sign(this.key)
			.then((token) => ({
				token,
				expiresAt: new Date(
					expiresAt * 1000,
				).toISOString(),
			}));
	}

	async verify(token: string, audience: TokenAudience): Promise<boolean> {
		return (await this.payload(token, audience)) !== null;
	}

	/** Claims of a valid API token, or null. */
	apiClaims(token: string): Promise<Record<string, unknown> | null> {
		return this.payload(token, "api");
	}

	/** The legal version the user ticked is signed into the state so it cannot be forged. */
	async issueOAuthState(
		nonce: string,
		legalVersion: string,
	): Promise<string> {
		return (
			await this.issue("oauth-state", "oauth", {
				nonce,
				legalVersion,
			})
		).token;
	}

	/** Returns the nonce and accepted legal version of a valid state token, or null. */
	async verifyOAuthState(
		state: string,
	): Promise<{ nonce: string; legalVersion: string } | null> {
		const claims = await this.payload(state, "oauth-state");
		return typeof claims?.nonce === "string" &&
			typeof claims.legalVersion === "string"
			? {
					nonce: claims.nonce,
					legalVersion: claims.legalVersion,
				}
			: null;
	}

	/** One-time code the studio trades for a JWT, so the token never travels in a URL. */
	createLoginCode(profile: GithubProfile): string {
		const now = Date.now();
		for (const [code, entry] of this.loginCodes) {
			if (entry.expiresAt <= now)
				this.loginCodes.delete(code);
		}
		const code = randomBytes(32).toString("base64url");
		this.loginCodes.set(code, {
			profile,
			expiresAt: now + LOGIN_CODE_TTL_MS,
		});
		return code;
	}

	redeemLoginCode(code: string): GithubProfile | null {
		const entry = this.loginCodes.get(code);
		this.loginCodes.delete(code);
		return entry && entry.expiresAt > Date.now()
			? entry.profile
			: null;
	}

	/** Claims of a valid token for the audience, or null. */
	claims(
		token: string,
		audience: TokenAudience,
	): Promise<Record<string, unknown> | null> {
		return this.payload(token, audience);
	}

	private async payload(
		token: string,
		audience: TokenAudience,
	): Promise<Record<string, unknown> | null> {
		try {
			const { payload } = await jwtVerify(token, this.key, {
				algorithms: ["HS256"],
				issuer: ISSUER,
				audience,
			});
			return payload;
		} catch {
			return null;
		}
	}
}

export function authHook(auth: AuthService, tokens: TokenRepo) {
	const lastTouch = new Map<string, number>();

	return async (request: FastifyRequest): Promise<void> => {
		if (request.method === "OPTIONS") return;
		if (!auth.enabled) {
			request.user = { login: "local", via: "local" };
			return;
		}
		const path = request.url.split("?")[0] ?? "";
		if (PUBLIC_PATHS.has(path)) return;

		const unauthorized = () =>
			new AppError(
				"UNAUTHORIZED",
				"Missing or invalid token",
				401,
			);

		// Browsers cannot set headers on a WebSocket, so the stream takes a short-lived ticket in the query.
		if (path === "/v1/telemetry") {
			const ticket = (request.query as { ticket?: string })
				.ticket;
			const claims = ticket
				? await auth.claims(ticket, "telemetry")
				: null;
			if (!claims || typeof claims.sub !== "string")
				throw unauthorized();
			request.user = { login: claims.sub, via: "jwt" };
			return;
		}

		const token = /^Bearer (.+)$/.exec(
			request.headers.authorization ?? "",
		)?.[1];
		if (!token) throw unauthorized();

		if (token.startsWith(TOKEN_PREFIX)) {
			const stored = await tokens.findByHash(
				hashApiToken(token),
			);
			if (
				!stored ||
				stored.revoked ||
				stored.expiresAt.getTime() <= Date.now()
			) {
				throw unauthorized();
			}
			if (!allowedForMcp(path)) {
				throw new AppError(
					"FORBIDDEN",
					"This token cannot access that endpoint",
					403,
				);
			}
			request.user = {
				login: stored.login,
				via: "mcp",
				tokenId: stored.tokenId,
				tokenExpiresAt: stored.expiresAt,
			};
			// Recording last use on every call would write constantly, so once a minute is enough.
			const now = Date.now();
			if (
				now - (lastTouch.get(stored.tokenId) ?? 0) >
				60_000
			) {
				lastTouch.set(stored.tokenId, now);
				void tokens
					.touch(stored.tokenId)
					.catch(() => undefined);
			}
			return;
		}

		const claims = await auth.claims(token, "api");
		if (!claims || typeof claims.sub !== "string")
			throw unauthorized();
		request.user = { login: claims.sub, via: "jwt", claims };
	};
}
