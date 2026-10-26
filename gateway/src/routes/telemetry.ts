import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { FUZZER_MODES } from "../contracts/schemas.js";
import type { AppContext } from "../context.js";
import { AppError } from "../errors.js";

const StartTestRun = z.object({
	type: z.literal("START_TEST_RUN"),
	fuzzerMode: z.enum(FUZZER_MODES),
	edgeId: z.string().min(1).optional(),
});

export const telemetryRoutes: FastifyPluginAsync<{ ctx: AppContext }> = async (
	app,
	{ ctx },
) => {
	app.get("/v1/telemetry", { websocket: true }, (socket) => {
		ctx.broadcaster.addClient(socket);
		app.log.info("Client connected to telemetry stream");

		const sendError = (
			code:
				| "VALIDATION_ERROR"
				| "RUN_IN_PROGRESS"
				| "UNKNOWN_EDGE"
				| "INTERNAL_ERROR",
			message: string,
		) =>
			ctx.broadcaster.send(socket, {
				type: "ERROR",
				timestamp: new Date().toISOString(),
				error: { code, message },
			});

		socket.on("message", async (data) => {
			let message: unknown;
			try {
				message = JSON.parse(data.toString());
			} catch {
				return sendError(
					"VALIDATION_ERROR",
					"Message must be valid JSON",
				);
			}

			const parsed = StartTestRun.safeParse(message);
			if (!parsed.success) {
				return sendError(
					"VALIDATION_ERROR",
					parsed.error.issues
						.map(
							(i) =>
								`${i.path.join(".")}: ${i.message}`,
						)
						.join("; "),
				);
			}

			try {
				await ctx.runService.start(parsed.data);
			} catch (err) {
				if (
					err instanceof AppError &&
					(err.code === "RUN_IN_PROGRESS" ||
						err.code === "UNKNOWN_EDGE")
				) {
					return sendError(err.code, err.message);
				}
				app.log.error(
					err,
					"Failed to process telemetry action",
				);
				sendError(
					"INTERNAL_ERROR",
					"Test run failed unexpectedly",
				);
			}
		});
	});
};
