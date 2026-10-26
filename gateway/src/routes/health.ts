import type { FastifyPluginAsync } from "fastify";
import type { AppContext } from "../context.js";

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

// DuckDB is Essential (down => 503); the semantic fuzzer is an Enhancement (down => degraded, still 200).
export const healthRoutes: FastifyPluginAsync<{ ctx: AppContext }> = async (
	app,
	{ ctx },
) => {
	app.get("/health", async (_request, reply) => {
		const [duckdbUp, fuzzer] = await Promise.all([
			ctx.store.ping(),
			ctx.semanticFuzzer.health(),
		]);
		const status: HealthStatus = !duckdbUp
			? "unhealthy"
			: fuzzer.up
				? "healthy"
				: "degraded";

		return reply.code(status === "unhealthy" ? 503 : 200).send({
			status,
			duckdb: duckdbUp ? "up" : "down",
			fuzzer: fuzzer.up ? "up" : "down",
			fuzzerMode: fuzzer.mode ?? null,
		});
	});
};
