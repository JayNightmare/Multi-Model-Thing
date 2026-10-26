import type { EdgeInfo, TraceRecord } from "../types";

export type DiffResult = "Match" | "Mismatch" | "Injected" | "Missing";

export interface DiffRow {
	field: string;
	expected: string;
	received: string;
	result: DiffResult;
}

export function formatValue(value: unknown): string {
	if (value === undefined) return "—";
	return JSON.stringify(value);
}

export function buildDiffRows(edge: EdgeInfo, trace: TraceRecord): DiffRow[] {
	const received =
		typeof trace.perturbedPayload === "object" &&
		trace.perturbedPayload !== null &&
		!Array.isArray(trace.perturbedPayload)
			? (trace.perturbedPayload as Record<string, unknown>)
			: {};
	const violatedFields = new Set(
		trace.violations.map((v) => v.path.split(".")[0]),
	);
	const contractFields = new Set(edge.contractFields.map((f) => f.field));

	const rows: DiffRow[] = edge.contractFields.map((f) => {
		if (!(f.field in received))
			return {
				field: f.field,
				expected: f.expected,
				received: "—",
				result: "Missing",
			};
		return {
			field: f.field,
			expected: f.expected,
			received: formatValue(received[f.field]),
			result: violatedFields.has(f.field)
				? "Mismatch"
				: "Match",
		};
	});

	for (const key of Object.keys(received)) {
		if (!contractFields.has(key)) {
			rows.push({
				field: key,
				expected: "not allowed",
				received: formatValue(received[key]),
				result: "Injected",
			});
		}
	}
	return rows;
}
