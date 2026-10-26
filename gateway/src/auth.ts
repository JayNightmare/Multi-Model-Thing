import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import type { AuthConfig } from "./config.js";
import { AppError } from "./errors.js";

// "api" tokens authorize REST calls; "telemetry" tickets are short-lived and only open the WebSocket.
export type TokenAudience = "api" | "telemetry";

const ISSUER = "contract-gateway";
const WS_TICKET_TTL_SECONDS = 30;
const PUBLIC_PATHS = new Set([
	"/health",
	"/openapi.json",
	"/v1/auth/login",
	"/v1/auth/status",
]);

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export interface IssuedToken {
	token: string;
	expiresAt: string;
}

export class AuthService {
	private readonly key: Uint8Array;

	constructor(private readonly config: AuthConfig) {
		this.key = new TextEncoder().encode(config.jwtSecret);
	}

	get enabled(): boolean {
		return this.config.enabled;
	}

	checkPassword(candidate: string): boolean {
		return timingSafeEqual(
			sha256(candidate),
			sha256(this.config.password),
		);
	}

	issue(audience: TokenAudience): Promise<IssuedToken> {
		const ttl =
			audience === "telemetry"
				? WS_TICKET_TTL_SECONDS
				: this.config.ttlSeconds;
		const expiresAt = Math.floor(Date.now() / 1000) + ttl;
		return new SignJWT({})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuer(ISSUER)
			.setAudience(audience)
			.setSubject("studio")
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
		try {
			await jwtVerify(token, this.key, {
				algorithms: ["HS256"],
				issuer: ISSUER,
				audience,
			});
			return true;
		} catch {
			return false;
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
