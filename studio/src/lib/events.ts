import type { TelemetryEvent, TelemetryFrame } from "../types";

export function frameToEvent(frame: TelemetryFrame): TelemetryEvent | null {
	if (frame.type === "ERROR") return null;
	const base = { time: frame.timestamp, runId: frame.runId };
	if (frame.type === "RUN_STARTED") {
		return {
			...base,
			id: `start-${frame.runId}`,
			type: frame.type,
			result: "Started",
			mutated: false,
		};
	}
	if (frame.type === "RUN_COMPLETED") {
		return {
			...base,
			id: `done-${frame.runId}`,
			type: frame.type,
			result: "Completed",
			mutated: false,
		};
	}
	return {
		...base,
		id: `trace-${frame.trace.traceId}`,
		type: frame.type,
		edgeId: frame.trace.edgeId,
		result: frame.trace.contractViolated ? "Violation" : "Pass",
		mutated: frame.trace.mutationType !== "NONE",
	};
}

export function formatTime(iso: string): string {
	return iso.slice(11, 23);
}
