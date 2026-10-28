import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z, type ZodTypeAny } from "zod";
import {
	deriveDownstreamStatus,
	type TraceRecord,
} from "../contracts/interceptor.js";
import { DEMO_PROJECT_ID } from "../contracts/demo.js";
import { MUTATION_TYPES } from "../contracts/schemas.js";
import type { AppContext } from "../context.js";
import { AppError } from "../errors.js";
import { accessProject, requireUser, viewerFor } from "./access.js";

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
		projectId: z.string().min(1).default(DEMO_PROJECT_ID),
		runId: z.string().min(1).max(128),
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
	projectId: z.string().min(1).default(DEMO_PROJECT_ID),
	runId: z.string().min(1).optional(),
	edgeId: z.string().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(1000).optional(),
});

const RunsQuery = z.object({
	projectId: z.string().min(1).default(DEMO_PROJECT_ID),
});

export const traceRoutes: FastifyPluginAsync<{ ctx: AppContext }> = async (
	app,
	{ ctx },
) => {
	app.post("/v1/traces", async (request, reply) => {
		const user = requireUser(request);
		const body = parseOrThrow(IngestBody, request.body);
		await accessProject(ctx, request, body.projectId, "run");
		const { edges } = await ctx.store.projects.getWorkflow(
			body.projectId,
		);
		const edge = edges.find((e) => e.id === body.edgeId);
		if (!edge) {
			throw new AppError(
				"UNKNOWN_EDGE",
				`Unknown edge "${body.edgeId}"`,
				422,
				{ knownEdges: edges.map((e) => e.id) },
			);
		}

		const violations = ctx.registry.validate(
			edge.schema,
			body.payload,
		);
		const contractViolated = violations.length > 0;
		const mutationType = body.mutation?.mutationType ?? "NONE";

		const trace: TraceRecord = {
			traceId: randomUUID(),
			runId: body.runId,
			edgeId: edge.id,
			sourceNodeId: edge.source,
			targetNodeId: edge.target,
			mutationType,
			strategy: body.mutation?.strategy,
			fuzzerFallback: false,
			originalPayload:
				body.mutation?.originalPayload ?? body.payload,
			perturbedPayload: body.payload,
			contractViolated,
			violations,
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
			const ok = await ctx.store.ensureRun(
				trace.runId,
				"heuristic",
				body.projectId,
				user.login,
			);
			if (!ok) {
				throw new AppError(
					"CONFLICT",
					"That run id belongs to another project or user",
					409,
				);
			}
			await ctx.store.saveTrace(trace);
		} catch (err) {
			if (err instanceof AppError) throw err;
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

		ctx.broadcaster.broadcast(
			{
				type: "TRACE_EMITTED",
				runId: trace.runId,
				timestamp: trace.timestamp,
				projectId: body.projectId,
				trace,
			},
			user.login,
		);
		return reply.code(201).send({
			traceId: trace.traceId,
			valid: !contractViolated,
			violations: trace.violations,
		});
	});

	app.get("/v1/traces", async (request) => {
		const user = requireUser(request);
		const query = parseOrThrow(TraceQuery, request.query);
		const project = await accessProject(
			ctx,
			request,
			query.projectId,
			"read",
		);
		return {
			traces: await ctx.store.listTraces({
				...query,
				viewer: viewerFor(project, user.login),
			}),
		};
	});

	app.get("/v1/runs", async (request) => {
		const user = requireUser(request);
		const { projectId } = parseOrThrow(RunsQuery, request.query);
		const project = await accessProject(
			ctx,
			request,
			projectId,
			"read",
		);
		return {
			runs: await ctx.store.listRuns({
				projectId,
				viewer: viewerFor(project, user.login),
			}),
		};
	});
};
