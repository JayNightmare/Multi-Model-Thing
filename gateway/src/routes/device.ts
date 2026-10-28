import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { generateApiToken, hashApiToken } from "../auth.js";
import type { AppContext } from "../context.js";
import { DEVICE_INTERVAL_SECONDS } from "../device.js";
import { AppError } from "../errors.js";
import { requireUser } from "./access.js";
import { parseOrThrow } from "./traces.js";

const StartBody = z.object({
	clientName: z.string().trim().min(1).max(80).default("MCP client"),
});
const TokenBody = z.object({ device_code: z.string().min(1).max(200) });
const ApproveBody = z.object({
	code: z.string().min(1).max(20),
	approve: z.boolean(),
});

const START_LIMIT = 10;
const START_WINDOW_MS = 60_000;

// RFC 8628 reports polling state as an OAuth error body with status 400.
const oauthError = (reply: FastifyReply, error: string) =>
	reply.code(400).send({ error });

export const deviceRoutes: FastifyPluginAsync<{ ctx: AppContext }> = async (
	app,
	{ ctx },
) => {
	const { auth, store } = ctx;
	const github = auth.github;
	if (!github) return;

	const starts = new Map<string, { count: number; resetAt: number }>();
	const sweep = setInterval(() => {
		const now = Date.now();
		for (const [ip, e] of starts)
			if (e.resetAt <= now) starts.delete(ip);
	}, START_WINDOW_MS);
	sweep.unref();
	app.addHook("onClose", async () => clearInterval(sweep));

	// Only the web session may manage tokens, so a leaked MCP token cannot mint or revoke others.
	const webSession = (request: FastifyRequest) => {
		const user = requireUser(request);
		if (user.via === "mcp") {
			throw new AppError(
				"FORBIDDEN",
				"Use the studio to do this",
				403,
			);
		}
		return user;
	};

	app.post("/v1/device/code", async (request, reply) => {
		const now = Date.now();
		const entry = starts.get(request.ip);
		const current =
			entry && entry.resetAt > now
				? entry
				: { count: 0, resetAt: now + START_WINDOW_MS };
		if (current.count >= START_LIMIT) {
			throw new AppError(
				"RATE_LIMITED",
				"Too many sign-in requests",
				429,
			);
		}
		starts.set(request.ip, {
			...current,
			count: current.count + 1,
		});

		const { clientName } = parseOrThrow(
			StartBody,
			request.body ?? {},
		);
		const started = auth.device.start(clientName);
		const uri = `${github.studioUrl}/connect`;
		return reply.send({
			device_code: started.deviceCode,
			user_code: started.userCode,
			verification_uri: uri,
			verification_uri_complete: `${uri}?code=${encodeURIComponent(started.userCode)}`,
			expires_in: started.expiresIn,
			interval: started.interval,
		});
	});

	app.post("/v1/device/token", async (request, reply) => {
		const body = TokenBody.safeParse(request.body);
		if (!body.success) return oauthError(reply, "invalid_request");
		const result = auth.device.poll(body.data.device_code);
		switch (result.state) {
			case "pending":
				return oauthError(
					reply,
					"authorization_pending",
				);
			case "slow_down":
				return oauthError(reply, "slow_down");
			case "denied":
				return oauthError(reply, "access_denied");
			case "expired":
				return oauthError(reply, "expired_token");
		}
		const token = generateApiToken();
		const ttlSeconds = ctx.config.mcpTokenTtlDays * 86_400;
		await store.tokens.create({
			tokenId: randomUUID(),
			tokenHash: hashApiToken(token),
			login: result.login,
			clientName: result.clientName,
			expiresAt: new Date(Date.now() + ttlSeconds * 1000),
		});
		request.log.info({ login: result.login }, "MCP token issued");
		return {
			access_token: token,
			token_type: "Bearer",
			expires_in: ttlSeconds,
			login: result.login,
		};
	});

	app.get("/v1/device/lookup", async (request) => {
		webSession(request);
		const { code } = request.query as { code?: string };
		const found = code ? auth.device.lookup(code) : null;
		if (!found) {
			throw new AppError(
				"NOT_FOUND",
				"Code not found or expired",
				404,
			);
		}
		return found;
	});

	app.post("/v1/device/approve", async (request) => {
		const user = webSession(request);
		const body = parseOrThrow(ApproveBody, request.body);
		if (!auth.device.decide(body.code, user.login, body.approve)) {
			throw new AppError(
				"NOT_FOUND",
				"Code not found or expired",
				404,
			);
		}
		request.log.info(
			{ login: user.login, approve: body.approve },
			"Device code decided",
		);
		return { ok: true, interval: DEVICE_INTERVAL_SECONDS };
	});

	app.get("/v1/tokens", async (request) => ({
		tokens: await store.tokens.list(webSession(request).login),
	}));

	app.delete("/v1/tokens/:tokenId", async (request, reply) => {
		const user = webSession(request);
		const { tokenId } = request.params as { tokenId: string };
		if (!(await store.tokens.revoke(user.login, tokenId))) {
			throw new AppError("NOT_FOUND", "Token not found", 404);
		}
		return reply.code(204).send();
	});
};
