import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import type { AuthConfig, GithubAuthConfig } from "./config.js";
import { AppError } from "./errors.js";

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
]);

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export interface IssuedToken {
	token: string;
	expiresAt: string;
}

export class AuthService {
	private readonly key: Uint8Array;
	private readonly loginCodes = new Map<
		string,
		{ login: string; expiresAt: number }
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

	async issueOAuthState(nonce: string): Promise<string> {
		return (await this.issue("oauth-state", "oauth", { nonce }))
			.token;
	}

	/** Returns the nonce embedded in a valid state token, or null. */
	async verifyOAuthState(state: string): Promise<string | null> {
		const nonce = (await this.payload(state, "oauth-state"))?.nonce;
		return typeof nonce === "string" ? nonce : null;
	}

	/** One-time code the studio trades for a JWT, so the token never travels in a URL. */
	createLoginCode(login: string): string {
		const now = Date.now();
		for (const [code, entry] of this.loginCodes) {
			if (entry.expiresAt <= now)
				this.loginCodes.delete(code);
		}
		const code = randomBytes(32).toString("base64url");
		this.loginCodes.set(code, {
			login,
			expiresAt: now + LOGIN_CODE_TTL_MS,
		});
		return code;
	}

	redeemLoginCode(code: string): string | null {
		const entry = this.loginCodes.get(code);
		this.loginCodes.delete(code);
		return entry && entry.expiresAt > Date.now()
			? entry.login
			: null;
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

export function authHook(auth: AuthService) {
	return async (request: FastifyRequest): Promise<void> => {
		if (!auth.enabled || request.method === "OPTIONS") return;
		const path = request.url.split("?")[0] ?? "";
		if (PUBLIC_PATHS.has(path)) return;

		// Browsers cannot set headers on a WebSocket, so the stream takes a short-lived ticket in the query.
		const isStream = path === "/v1/telemetry";
		const token = isStream
			? (request.query as { ticket?: string }).ticket
			: /^Bearer (.+)$/.exec(
					request.headers.authorization ?? "",
				)?.[1];

		if (
			!token ||
			!(await auth.verify(
				token,
				isStream ? "telemetry" : "api",
			))
		) {
			throw new AppError(
				"UNAUTHORIZED",
				"Missing or invalid token",
				401,
			);
		}
	};
}
