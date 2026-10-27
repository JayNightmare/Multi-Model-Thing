import { pathToFileURL } from "node:url";
import cors from "@fastify/cors";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { AuthService, authHook } from "./auth.js";
import { loadConfig, type AppConfig } from "./config.js";
import type { AppContext } from "./context.js";
import { AppError, errorBody } from "./errors.js";
import { HeuristicFuzzer } from "./fuzzers/heuristic.js";
import { SemanticLocalFuzzer } from "./fuzzers/semantic.js";
import { openApiSpec } from "./openapi.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { telemetryRoutes } from "./routes/telemetry.js";
import { traceRoutes } from "./routes/traces.js";
import { TelemetryBroadcaster } from "./services/broadcaster.js";
import { RunService } from "./services/run-service.js";
import { DuckDbTraceStore, type TraceStore } from "./storage/duckdb.js";

export interface BuildOptions {
	config?: AppConfig;
	store?: TraceStore;
}

export async function buildServer(
	options: BuildOptions = {},
): Promise<FastifyInstance> {
	const config = options.config ?? loadConfig();
	const app = Fastify({
		trustProxy: config.trustProxy,
		logger:
			config.logLevel === "silent"
				? false
				: { level: config.logLevel },
	});

	const store = options.store ?? new DuckDbTraceStore(config.duckdbPath);
	if (!options.store) await store.init();

	const heuristic = new HeuristicFuzzer();
	const semanticFuzzer = new SemanticLocalFuzzer(
		config.fuzzerUrl,
		heuristic,
	);
	const broadcaster = new TelemetryBroadcaster();
	const runService = new RunService({
		store,
		broadcaster,
		fuzzers: { heuristic, semantic: semanticFuzzer },
		log: app.log,
	});
	const ctx: AppContext = {
		config,
		auth: new AuthService(config.auth),
		store,
		broadcaster,
		runService,
		semanticFuzzer,
	};

	app.addHook("onClose", async () => {
		broadcaster.destroy();
		await store.close();
	});

	app.setErrorHandler((thrown, _request, reply) => {
		const err = thrown as Error & { statusCode?: number };
		if (err instanceof AppError) {
			return reply
				.code(err.statusCode)
				.send(
					errorBody(
						err.code,
						err.message,
						err.details,
					),
				);
		}
		const statusCode = err.statusCode ?? 500;
		if (statusCode >= 400 && statusCode < 500) {
			return reply
				.code(statusCode)
				.send(
					errorBody(
						"VALIDATION_ERROR",
						err.message,
					),
				);
		}
		app.log.error(err);
		return reply
			.code(500)
			.send(
				errorBody(
					"INTERNAL_ERROR",
					"Internal server error",
				),
			);
	});
	app.setNotFoundHandler((request, reply) =>
		reply
			.code(404)
			.send(
				errorBody(
					"NOT_FOUND",
					`Route ${request.method} ${request.url} not found`,
				),
			),
	);

	await app.register(cors, { origin: config.corsOrigins });
	// Registered after cors so 401s still carry CORS headers.
	app.addHook("onRequest", authHook(ctx.auth));
	await app.register(fastifyWebsocket);

	app.get("/openapi.json", async () => openApiSpec);
	await app.register(authRoutes, { ctx });
	await app.register(healthRoutes, { ctx });
	await app.register(traceRoutes, { ctx });
	await app.register(telemetryRoutes, { ctx });

	return app;
}

async function main(): Promise<void> {
	const config = loadConfig();
	const app = await buildServer({ config });
	const shutdown = () => void app.close().then(() => process.exit(0));
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
	await app.listen({ port: config.port, host: config.host });
	app.log.info(
		`Telemetry WebSocket available at /v1/telemetry (port ${config.port})`,
	);
}

// Under pm2, argv[1] is pm2's fork wrapper rather than this file, so also trust pm_id.
if (
	process.env.pm_id !== undefined ||
	(process.argv[1] &&
		import.meta.url === pathToFileURL(process.argv[1]).href)
) {
	main().catch((err) => {
		console.error("Fatal initialization error:", err);
		process.exit(1);
	});
}
