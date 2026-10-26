import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z, type ZodTypeAny } from "zod";
import {
	deriveDownstreamStatus,
	type TraceRecord,
} from "../contracts/interceptor.js";
import {
	EDGES,
	MUTATION_TYPES,
	getEdge,
	toViolations,
} from "../contracts/schemas.js";
import type { AppContext } from "../context.js";
import { AppError } from "../errors.js";

export function parseOrThrow<S extends ZodTypeAny>(
	schema: S,
	data: unknown,
): z.infer<S> {
	const result = schema.safeParse(data);
	if (!result.success) {
		throw new AppError(
			"VALIDATION_ERROR",
			"Request validation failed",
			422,
			result.error.issues,
		);
	}
	return result.data;
}

const IngestBody = z
	.object({
		runId: z.string().min(1),
		edgeId: z.string().min(1),
		payload: z.unknown(),
		mutation: z
			.object({
				mutationType: z.enum(MUTATION_TYPES),
				originalPayload: z.unknown().optional(),
				strategy: z.string().optional(),
			})
			.optional(),
	})
	.refine((b) => b.payload !== undefined, {
		message: "payload is required",
		path: ["payload"],
	});

const TraceQuery = z.object({
	runId: z.string().min(1).optional(),
	edgeId: z.string().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export const traceRoutes: FastifyPluginAsync<{ ctx: AppContext }> = async (
	app,
	{ ctx },
) => {
	app.post("/v1/traces", async (request, reply) => {
		const body = parseOrThrow(IngestBody, request.body);
		const edge = getEdge(body.edgeId);
		if (!edge) {
			throw new AppError(
				"UNKNOWN_EDGE",
				`Unknown edge "${body.edgeId}"`,
				422,
				{ knownEdges: EDGES.map((e) => e.id) },
			);
		}

		const validation = edge.schema.safeParse(body.payload);
		const contractViolated = !validation.success;
		const mutationType = body.mutation?.mutationType ?? "NONE";

		const trace: TraceRecord = {
			traceId: randomUUID(),
			runId: body.runId,
			edgeId: edge.id,
			sourceNodeId: edge.sourceNodeId,
			targetNodeId: edge.targetNodeId,
			mutationType,
			strategy: body.mutation?.strategy,
			fuzzerFallback: false,
			originalPayload:
				body.mutation?.originalPayload ?? body.payload,
			perturbedPayload: body.payload,
			contractViolated,
			violations: validation.success
				? []
				: toViolations(validation.error.issues),
			downstreamHandled: true,
			downstreamStatus: deriveDownstreamStatus({
				handled: true,
				mutationType,
				contractViolated,
			}),
			durationMs: 0,
			timestamp: new Date().toISOString(),
		};

		try {
			await ctx.store.ensureRun(trace.runId, "heuristic");
			await ctx.store.saveTrace(trace);
		} catch (err) {
			request.log.error(
				err,
				"Failed to persist ingested trace",
			);
			throw new AppError(
				"SERVICE_UNAVAILABLE",
				"Trace storage is unavailable",
				503,
			);
		}

		ctx.broadcaster.broadcast({
			type: "TRACE_EMITTED",
			runId: trace.runId,
			timestamp: trace.timestamp,
			trace,
		});
		return reply
			.code(201)
			.send({
				traceId: trace.traceId,
				valid: !contractViolated,
				violations: trace.violations,
			});
	});

	app.get("/v1/traces", async (request) => {
		const query = parseOrThrow(TraceQuery, request.query);
		return { traces: await ctx.store.listTraces(query) };
	});

	app.get("/v1/runs", async () => ({ runs: await ctx.store.listRuns() }));
};
