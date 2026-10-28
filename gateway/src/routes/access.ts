import type { FastifyRequest } from "fastify";
import type { AppContext } from "../context.js";
import { AppError } from "../errors.js";
import type { AuthUser } from "../auth.js";
import type { ProjectInfo } from "../storage/projects.js";

export function requireUser(request: FastifyRequest): AuthUser {
	if (!request.user) {
		throw new AppError(
			"UNAUTHORIZED",
			"Missing or invalid token",
			401,
		);
	}
	return request.user;
}

/**
 * "read" and "run" reach your own projects and the demo project, "write" only your own.
 * Someone else's project looks exactly like a missing one.
 */
export async function accessProject(
	ctx: AppContext,
	request: FastifyRequest,
	projectId: string,
	mode: "read" | "run" | "write",
): Promise<ProjectInfo> {
	const user = requireUser(request);
	const project = await ctx.store.projects.get(projectId);
	const allowed =
		project !== null &&
		(project.ownerLogin === user.login ||
			(project.isDemo && mode !== "write"));
	if (!project || !allowed) {
		throw new AppError("NOT_FOUND", "Project not found", 404);
	}
	return project;
}

/** Demo runs are private to whoever started them, other projects are visible in full to their owner. */
export const viewerFor = (project: ProjectInfo, login: string) =>
	project.isDemo ? login : undefined;
