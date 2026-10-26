import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { AppError } from "../errors.js";

const Login = z.object({ password: z.string().min(1).max(256) });

const MAX_FAILURES = 5;
const WINDOW_MS = 60_000;

export const authRoutes: FastifyPluginAsync<{ ctx: AppContext }> = async (
	app,
	{ ctx },
) => {
	const { auth } = ctx;
	const failures = new Map<string, { count: number; resetAt: number }>();

	app.get("/v1/auth/status", async () => ({ required: auth.enabled }));

	app.post("/v1/auth/login", async (request, reply) => {
		if (!auth.enabled) {
			throw new AppError(
				"NOT_FOUND",
				"Authentication is not enabled",
				404,
			);
		}
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

		const body = Login.safeParse(request.body);
		if (!body.success || !auth.checkPassword(body.data.password)) {
			const current =
				entry && entry.resetAt > now
					? entry
					: {
							count: 0,
							resetAt:
								now + WINDOW_MS,
						};
			failures.set(request.ip, {
				...current,
				count: current.count + 1,
			});
			throw new AppError(
				"UNAUTHORIZED",
				"Invalid credentials",
				401,
			);
		}

		failures.delete(request.ip);
		return { ...(await auth.issue("api")), tokenType: "Bearer" };
	});

	app.post("/v1/auth/ws-ticket", async () => {
		const { token, expiresAt } = await auth.issue("telemetry");
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
