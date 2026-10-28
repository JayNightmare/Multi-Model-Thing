import { randomBytes } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import {
	MAX_JSON_BYTES,
	describeContract,
	jsonSize,
} from "../contracts/registry.js";
import { FUZZER_MODES } from "../contracts/schemas.js";
import { AppError } from "../errors.js";
import type { EdgeRecord } from "../storage/projects.js";
import { accessProject, requireUser } from "./access.js";
import { parseOrThrow } from "./traces.js";

export const MAX_PROJECTS_PER_USER = 20;
const MAX_EDGES = 50;

const Id = /^[a-z0-9][a-z0-9_-]{0,62}$/;

const CreateProject = z.object({ name: z.string().trim().min(1).max(80) });

const Workflow = z.object({
	agents: z
		.array(
			z.object({
				id: z.string().regex(Id),
				name: z.string().trim().min(1).max(100),
				role: z.string().max(200).default(""),
			}),
		)
		.min(1)
		.max(MAX_EDGES),
	edges: z
		.array(
			z.object({
				id: z.string().regex(Id),
				source: z.string().regex(Id),
				target: z.string().regex(Id),
				label: z
					.string()
					.trim()
					.min(1)
					.max(200)
					.optional(),
				schema: z.record(z.unknown()),
				contractHint: z.string().max(1000).optional(),
				baseline: z.record(z.unknown()),
			}),
		)
		.min(1)
		.max(MAX_EDGES),
});

const StartRun = z.object({
	fuzzerMode: z.enum(FUZZER_MODES).default("heuristic"),
	edgeIds: z.array(z.string()).max(MAX_EDGES).optional(),
	seed: z.string().min(1).max(128).optional(),
});

const CaseResult = z.object({
	handled: z.boolean(),
	error: z.string().max(4000).optional(),
	durationMs: z.number().min(0).max(3_600_000).optional(),
});

const unique = (ids: string[]) => new Set(ids).size === ids.length;

export const projectRoutes: FastifyPluginAsync<{ ctx: AppContext }> = async (
	app,
	{ ctx },
) => {
	const { store, registry } = ctx;

	const workflowOf = async (projectId: string) => {
		const project = await store.projects.get(projectId);
		return {
			project,
			...(await store.projects.getWorkflow(projectId)),
		};
	};

	app.get("/v1/projects", async (request) => ({
		projects: await store.projects.list(requireUser(request).login),
	}));

	app.post("/v1/projects", async (request, reply) => {
		const user = requireUser(request);
		const { name } = parseOrThrow(CreateProject, request.body);
		if (
			(await store.projects.countOwned(user.login)) >=
			MAX_PROJECTS_PER_USER
		) {
			throw new AppError(
				"VALIDATION_ERROR",
				`You can have up to ${MAX_PROJECTS_PER_USER} projects`,
				422,
			);
		}
		const projectId = `p_${randomBytes(6).toString("hex")}`;
		await store.projects.create({
			projectId,
			owner: user.login,
			name,
		});
		return reply
			.code(201)
			.send(await store.projects.get(projectId));
	});

	app.delete("/v1/projects/:projectId", async (request, reply) => {
		const { projectId } = request.params as { projectId: string };
		await accessProject(ctx, request, projectId, "write");
		await store.projects.delete(projectId);
		return reply.code(204).send();
	});

	app.get("/v1/projects/:projectId/workflow", async (request) => {
		const { projectId } = request.params as { projectId: string };
		await accessProject(ctx, request, projectId, "read");
		return workflowOf(projectId);
	});

	app.put("/v1/projects/:projectId/workflow", async (request) => {
		const { projectId } = request.params as { projectId: string };
		await accessProject(ctx, request, projectId, "write");
		const body = parseOrThrow(Workflow, request.body);

		if (!unique(body.agents.map((a) => a.id))) {
			throw new AppError(
				"VALIDATION_ERROR",
				"Agent ids must be unique",
				422,
			);
		}
		if (!unique(body.edges.map((e) => e.id))) {
			throw new AppError(
				"VALIDATION_ERROR",
				"Edge ids must be unique",
				422,
			);
		}
		const agentIds = new Set(body.agents.map((a) => a.id));
		const edges: EdgeRecord[] = body.edges.map((e) => {
			for (const end of [e.source, e.target]) {
				if (!agentIds.has(end)) {
					throw new AppError(
						"VALIDATION_ERROR",
						`Edge "${e.id}" refers to unknown agent "${end}"`,
						422,
					);
				}
			}
			registry.assertValid(e.schema);
			if (jsonSize(e.baseline) > MAX_JSON_BYTES) {
				throw new AppError(
					"VALIDATION_ERROR",
					`Baseline of edge "${e.id}" is larger than 64 KB`,
					422,
				);
			}
			// A baseline that breaks its own contract would make every test result meaningless.
			const violations = registry.validate(
				e.schema,
				e.baseline,
			);
			if (violations.length > 0) {
				throw new AppError(
					"VALIDATION_ERROR",
					`Baseline of edge "${e.id}" does not satisfy its contract`,
					422,
					violations,
				);
			}
			return {
				id: e.id,
				source: e.source,
				target: e.target,
				label: e.label ?? `${e.source} → ${e.target}`,
				schema: e.schema,
				contractHint: e.contractHint ?? null,
				baseline: e.baseline,
			};
		});

		await store.projects.setWorkflow(projectId, body.agents, edges);
		return workflowOf(projectId);
	});

	// The shape the studio draws: agents with their latest latency, edges with a readable contract.
	app.get("/v1/projects/:projectId/topology", async (request) => {
		const user = requireUser(request);
		const { projectId } = request.params as { projectId: string };
		const project = await accessProject(
			ctx,
			request,
			projectId,
			"read",
		);
		const { agents, edges } =
			await store.projects.getWorkflow(projectId);
		const traces = await store.listTraces({
			projectId,
			viewer: project.isDemo ? user.login : undefined,
			limit: 200,
		});
		return {
			agents: agents.map((a) => ({
				...a,
				// Traces are newest first, so the first hit per target is its latest latency.
				lastLatencyMs:
					traces.find(
						(t) => t.targetNodeId === a.id,
					)?.durationMs ?? null,
			})),
			edges: edges.map((e) => ({
				id: e.id,
				source: e.source,
				target: e.target,
				label: e.label,
				contractFields: describeContract(e.schema),
			})),
		};
	});

	app.post("/v1/projects/:projectId/runs", async (request, reply) => {
		const user = requireUser(request);
		const { projectId } = request.params as { projectId: string };
		await accessProject(ctx, request, projectId, "run");
		const body = parseOrThrow(StartRun, request.body ?? {});
		const started = await ctx.projectRuns.start({
			projectId,
			owner: user.login,
			...body,
		});
		return reply.code(201).send({ ...started, projectId });
	});

	app.post("/v1/runs/:runId/next", async (request) => {
		const user = requireUser(request);
		const { runId } = request.params as { runId: string };
		return ctx.projectRuns.next(runId, user.login);
	});

	app.post("/v1/runs/:runId/cases/:caseId/result", async (request) => {
		const user = requireUser(request);
		const { runId, caseId } = request.params as {
			runId: string;
			caseId: string;
		};
		const result = parseOrThrow(CaseResult, request.body);
		return ctx.projectRuns.report(
			runId,
			user.login,
			caseId,
			result,
		);
	});
};
