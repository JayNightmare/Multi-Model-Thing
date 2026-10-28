export interface RunCase {
	caseId: string;
	index: number;
	total: number;
	edgeId: string;
	label: string;
	sourceAgent: string;
	targetAgent: string;
	mutationType: string;
	strategy: string | null;
	payload: unknown;
	contractViolated: boolean;
	violations: { path: string; code: string; message: string }[];
}

export interface RunSummary {
	runId: string;
	projectId: string;
	totalCases: number;
	reported: number;
	violations: number;
	recovered: number;
	breaches: number;
	bypassed: number;
	recoveryRate: number;
}

export type Step =
	| { done: false; case: RunCase }
	| { done: true; summary: RunSummary };

/** Instructions the assistant follows for one case; the payload must be sent unchanged. */
export function describeCase(runId: string, c: RunCase): string {
	const verdict = c.contractViolated
		? `VIOLATED (${c.violations.map((v) => `${v.path}: ${v.message}`).join("; ")})`
		: "satisfied";
	const mutation =
		c.mutationType === "NONE"
			? "baseline (unmodified)"
			: `${c.mutationType}${c.strategy ? ` via ${c.strategy}` : ""}`;
	return [
		`Case ${c.index} of ${c.total} (${c.caseId}) on edge "${c.edgeId}": ${c.sourceAgent} -> ${c.targetAgent}`,
		`Mutation: ${mutation}`,
		`Contract check by the gateway: ${verdict}`,
		"",
		`Send exactly this payload to the "${c.targetAgent}" agent, unchanged:`,
		JSON.stringify(c.payload, null, 2),
		"",
		`Then call mml_report_result with runId "${runId}", caseId "${c.caseId}", handled (true if the agent returned normally, false if it threw or failed), error (the message, if it failed) and durationMs.`,
		"Do not fix or retry the agent between cases: a crash is the result being measured.",
	].join("\n");
}

export function describeSummary(s: RunSummary, dashboardUrl?: string): string {
	return [
		`Run ${s.runId} finished: ${s.reported}/${s.totalCases} cases reported.`,
		`- Contract violations: ${s.violations}`,
		`- Recovered (violation, agent survived): ${s.recovered}`,
		`- Breaches (agent failed): ${s.breaches}`,
		`- Bypassed (mutated but still valid, a gap in the contract): ${s.bypassed}`,
		`- Recovery rate: ${s.recoveryRate}%`,
		dashboardUrl ? `Details: ${dashboardUrl}` : "",
	]
		.filter(Boolean)
		.join("\n");
}

/** Run summary for `.mml/latest.md`. It deliberately omits payloads, which stay on the gateway. */
export function summaryMarkdown(
	s: RunSummary,
	project: string,
	finishedAt: string,
): string {
	return [
		`# Latest Contract Tester run`,
		"",
		`Project: ${project}`,
		`Run: \`${s.runId}\``,
		`Finished: ${finishedAt}`,
		"",
		"| Measure | Value |",
		"| --- | --- |",
		`| Cases reported | ${s.reported} of ${s.totalCases} |`,
		`| Contract violations | ${s.violations} |`,
		`| Recovered | ${s.recovered} |`,
		`| Breaches | ${s.breaches} |`,
		`| Bypassed | ${s.bypassed} |`,
		`| Recovery rate | ${s.recoveryRate}% |`,
		"",
	].join("\n");
}
