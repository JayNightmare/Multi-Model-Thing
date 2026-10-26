import type {
	AgentInfo,
	EdgeHealth,
	EdgeInfo,
	EdgeSummary,
	RunMetrics,
	RunSummary,
	TraceRecord,
} from "../types";

export function classifyEdgeHealth(
	breached: number,
	violations: number,
): EdgeHealth {
	if (breached > 0) return "red";
	if (violations > 0) return "amber";
	return "green";
}

export const EDGE_HEALTH_LABEL: Record<EdgeHealth, string> = {
	green: "Healthy",
	amber: "Degraded",
	red: "Failing",
};

export function summarizeTraces(traces: TraceRecord[]): EdgeSummary[] {
	const byEdge = new Map<string, EdgeSummary>();
	for (const t of traces) {
		const s = byEdge.get(t.edgeId) ?? {
			edgeId: t.edgeId,
			total: 0,
			passed: 0,
			violations: 0,
			recovered: 0,
			breached: 0,
			health: "green" as EdgeHealth,
		};
		s.total += 1;
		if (!t.contractViolated) s.passed += 1;
		if (t.contractViolated) s.violations += 1;
		if (t.contractViolated && t.downstreamStatus !== "FAILED")
			s.recovered += 1;
		if (t.downstreamStatus === "FAILED") s.breached += 1;
		s.health = classifyEdgeHealth(s.breached, s.violations);
		byEdge.set(t.edgeId, s);
	}
	return [...byEdge.values()];
}

export function computeMetrics(
	runs: RunSummary[],
	liveRunId: string | null,
	liveTraces: TraceRecord[],
	agents: AgentInfo[],
): RunMetrics {
	const settled = runs
		.filter((r) => r.runId !== liveRunId)
		.flatMap((r) => r.edges);
	const edges = [...settled, ...summarizeTraces(liveTraces)];
	const sum = (pick: (e: EdgeSummary) => number) =>
		edges.reduce((acc, e) => acc + pick(e), 0);

	const violations = sum((e) => e.violations);
	const recovered = sum((e) => e.recovered);
	const latencies =
		liveTraces.length > 0
			? liveTraces.map((t) => t.durationMs)
			: agents
					.map((a) => a.lastLatencyMs)
					.filter((v): v is number => v !== null);

	return {
		runId: liveRunId ?? runs[0]?.runId ?? "",
		contractsChecked: sum((e) => e.total),
		violations,
		recovered,
		breaches: sum((e) => e.breached),
		recoveryRate:
			violations > 0
				? Math.round((recovered / violations) * 1000) /
					10
				: 100,
		avgLatencyMs: latencies.length
			? Math.round(
					latencies.reduce((a, b) => a + b, 0) /
						latencies.length,
				)
			: 0,
	};
}

export type AgentStatus = "Healthy" | "Violated" | "Failing";

// An agent's status follows the health of the contracts it receives.
export function agentStatus(
	agentId: string,
	edges: EdgeInfo[],
	summaries: EdgeSummary[],
): AgentStatus {
	const inbound = summaries.filter(
		(s) => edges.find((e) => e.id === s.edgeId)?.target === agentId,
	);
	if (inbound.some((s) => s.health === "red")) return "Failing";
	if (inbound.some((s) => s.health === "amber")) return "Violated";
	return "Healthy";
}

export function lastMutationLabel(
	edgeId: string,
	traces: TraceRecord[],
): string {
	const latest = [...traces]
		.filter((t) => t.edgeId === edgeId && t.mutationType !== "NONE")
		.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
	return latest ? (latest.strategy ?? latest.mutationType) : "none";
}

export function metricsFromTraces(runId: string, traces: TraceRecord[]): RunMetrics {
  const violations = traces.filter((t) => t.contractViolated).length;
  const recovered = traces.filter((t) => t.contractViolated && t.downstreamStatus !== 'FAILED').length;
  return {
    runId,
    contractsChecked: traces.length,
    violations,
    recovered,
    breaches: traces.filter((t) => t.downstreamStatus === 'FAILED').length,
    recoveryRate: violations > 0 ? Math.round((recovered / violations) * 1000) / 10 : 100,
    avgLatencyMs: traces.length ? Math.round(traces.reduce((a, t) => a + t.durationMs, 0) / traces.length) : 0,
  };
}
