import {
	Body1,
	Button,
	Caption1,
	Subtitle1,
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableHeaderCell,
	TableRow,
	ToggleButton,
	Toolbar,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import {
	ArrowClockwiseRegular,
	ArrowDownloadRegular,
	ArrowSwapRegular,
	GridRegular,
	PlayRegular,
} from "@fluentui/react-icons";
import { Background, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { AgentNode, type AgentNodeType } from "../components/AgentNode";
import { DiffDrawer } from "../components/DiffDrawer";
import { HealthEdge, type HealthEdgeType } from "../components/HealthEdge";
import { Hero } from "../components/Hero";
import { MetricCards } from "../components/MetricCards";
import {
	EmptyState,
	ErrorState,
	HealthBadge,
	LoadingState,
} from "../components/StateViews";
import { useTelemetry } from "../hooks/TelemetryContext";
import { useAsync } from "../hooks/useAsync";
import {
	agentStatus,
	computeMetrics,
	lastMutationLabel,
	summarizeTraces,
} from "../lib/metrics";
import { useThemeMode } from "../theme/theme";
import type { EdgeSummary, FuzzerMode } from "../types";

const nodeTypes = { agent: AgentNode };
const edgeTypes = { health: HealthEdge };

const useStyles = makeStyles({
	title: {
		display: "flex",
		alignItems: "baseline",
		justifyContent: "space-between",
		gap: "12px",
	},
	muted: { color: tokens.colorNeutralForeground3 },
	flow: {
		height: "280px",
		borderRadius: tokens.borderRadiusMedium,
		border: `1px solid ${tokens.colorNeutralStroke1}`,
		overflow: "hidden",
	},
	tableWrap: {
		borderRadius: tokens.borderRadiusMedium,
		border: `1px solid ${tokens.colorNeutralStroke1}`,
		backgroundColor: tokens.colorNeutralBackground3,
	},
	row: { cursor: "pointer" },
	actionBar: {
		display: "flex",
		flexWrap: "wrap",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: "8px",
		position: "sticky",
		bottom: 0,
		padding: "10px 12px",
		borderRadius: tokens.borderRadiusMedium,
		border: `1px solid ${tokens.colorNeutralStroke1}`,
		backgroundColor: tokens.colorNeutralBackground3,
	},
	modeGroup: { display: "flex", gap: "4px", marginRight: "auto" },
});

const EMPTY_SUMMARY = (edgeId: string): EdgeSummary => ({
	edgeId,
	total: 0,
	passed: 0,
	violations: 0,
	recovered: 0,
	breached: 0,
	health: "green",
});

export default function ContractCanvas() {
	const styles = useStyles();
	const navigate = useNavigate();
	const { resolved } = useThemeMode();
	const telemetry = useTelemetry();
	const [mode, setMode] = useState<FuzzerMode>("semantic");
	const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(
		null,
	);
	const [drawerEdgeId, setDrawerEdgeId] = useState<string | null>(null);

	const topology = useAsync(() => api.getTopology(), []);
	const runs = useAsync(() => api.listRuns(), [telemetry.completedRuns]);
	const latestRun = runs.data?.[0];
	const latestRunId = latestRun?.runId;
	const settledTraces = useAsync(
		() =>
			runs.status === "ready"
				? api.listTraces(
						latestRunId
							? { runId: latestRunId }
							: undefined,
					)
				: Promise.resolve([]),
		[runs.status, latestRunId, telemetry.completedRuns],
	);

	const liveRunId = telemetry.isRunning ? telemetry.activeRunId : null;
	const traces = liveRunId
		? telemetry.traces
		: (settledTraces.data ?? []);
	const agents = topology.data?.agents ?? [];
	const edges = topology.data?.edges ?? [];
	const summaries = liveRunId
		? summarizeTraces(telemetry.traces)
		: (latestRun?.edges ?? []);
	const summaryFor = (edgeId: string) =>
		summaries.find((s) => s.edgeId === edgeId) ??
		EMPTY_SUMMARY(edgeId);
	const passRate = (s: EdgeSummary) =>
		s.total > 0 ? `${s.passed}/${s.total}` : "—";

	const metrics = useMemo(
		() =>
			computeMetrics(
				runs.data ?? [],
				liveRunId,
				telemetry.traces,
				agents,
			),
		[runs.data, liveRunId, telemetry.traces, agents],
	);

	const nodes: AgentNodeType[] = agents.map((a, i) => ({
		id: a.id,
		type: "agent",
		position: { x: i * 290, y: 70 },
		draggable: false,
		data: {
			agentId: a.id,
			name: a.name,
			role: a.role,
			latencyMs: a.lastLatencyMs,
			status: agentStatus(a.id, edges, summaries),
		},
	}));
	const flowEdges: HealthEdgeType[] = edges.map((e) => {
		const s = summaryFor(e.id);
		return {
			id: e.id,
			type: "health",
			source: e.source,
			target: e.target,
			data: {
				health: s.health,
				passRate: passRate(s),
				selected: e.id === selectedEdgeId,
			},
		};
	});

	const drawerEdge = edges.find((e) => e.id === drawerEdgeId) ?? null;
	const drawerTrace = drawerEdge
		? (traces.find(
				(t) =>
					t.edgeId === drawerEdge.id &&
					t.contractViolated,
			) ??
			traces.find((t) => t.edgeId === drawerEdge.id) ??
			null)
		: null;

	const run = () => telemetry.triggerRun(mode);
	const retest = () =>
		selectedEdgeId && telemetry.triggerRun(mode, selectedEdgeId);
	const runDisabled = !telemetry.isConnected || telemetry.isRunning;

	const actionBar = (
		<Toolbar
			className={styles.actionBar}
			aria-label="Fuzzer controls"
		>
			<div
				className={styles.modeGroup}
				role="group"
				aria-label="Fuzzer mode"
			>
				<ToggleButton
					size="small"
					checked={mode === "heuristic"}
					onClick={() => setMode("heuristic")}
				>
					Heuristic
				</ToggleButton>
				<ToggleButton
					size="small"
					checked={mode === "semantic"}
					onClick={() => setMode("semantic")}
				>
					Semantic
				</ToggleButton>
			</div>
			<Button
				icon={<ArrowClockwiseRegular />}
				disabled={runDisabled || !selectedEdgeId}
				onClick={retest}
			>
				Retest Edge
			</Button>
			<Button
				appearance="primary"
				icon={<PlayRegular />}
				disabled={runDisabled}
				onClick={run}
			>
				{telemetry.isRunning
					? "Running perturbation pass…"
					: "Run Perturbation Pass"}
			</Button>
		</Toolbar>
	);

	const loading =
		topology.status === "loading" || runs.status === "loading";
	const failed =
		topology.status === "error"
			? topology
			: runs.status === "error"
				? runs
				: null;
	const empty =
		!loading &&
		!failed &&
		(agents.length === 0 ||
			(runs.data?.length === 0 && !liveRunId));

	return (
		<>
			<Hero
				eyebrow="Adversarial contract tester"
				title="Stress-test every agent handoff"
				subtitle="Mutate inter-agent payloads, verify the Zod contract on every edge, and see which downstream agents recover or crash."
				primary={{
					label: "Review payload diff",
					icon: <ArrowSwapRegular />,
					onClick: () =>
						navigate(
							selectedEdgeId
								? `/edges/${selectedEdgeId}`
								: "/edges",
						),
				}}
				secondary={{
					label: "Export HTML report",
					icon: <ArrowDownloadRegular />,
					onClick: () => navigate("/report"),
				}}
			/>

			<div className={styles.title}>
				<Subtitle1>Agent Graph</Subtitle1>
				<Caption1 className={styles.muted}>
					{agents.length} agents
					{(liveRunId ?? latestRunId)
						? ` · ${liveRunId ?? latestRunId}`
						: ""}
				</Caption1>
			</div>

			{loading ? (
				<LoadingState
					rows={6}
					label="Loading agent graph"
				/>
			) : failed ? (
				<ErrorState
					message={
						failed.error ?? "Unknown error"
					}
					onRetry={() => {
						topology.reload();
						runs.reload();
					}}
				/>
			) : empty ? (
				<EmptyState
					icon={<GridRegular fontSize={64} />}
					title="No contract runs yet"
					body="Run a perturbation pass to mutate payloads across the agent graph and populate edge health."
					action={
						<Button
							appearance="primary"
							icon={<PlayRegular />}
							disabled={runDisabled}
							onClick={run}
						>
							Run Perturbation Pass
						</Button>
					}
				/>
			) : (
				<>
					<MetricCards metrics={metrics} />
					<div className={styles.flow}>
						<ReactFlow
							nodes={nodes as Node[]}
							edges={
								flowEdges as Edge[]
							}
							nodeTypes={nodeTypes}
							edgeTypes={edgeTypes}
							colorMode={resolved}
							fitView
							fitViewOptions={{
								padding: 0.15,
							}}
							nodesDraggable={false}
							nodesConnectable={false}
							onEdgeClick={(
								_,
								edge,
							) => {
								setSelectedEdgeId(
									edge.id,
								);
								setDrawerEdgeId(
									edge.id,
								);
							}}
						>
							<Background />
						</ReactFlow>
					</div>

					<div className={styles.title}>
						<Subtitle1>
							Edge Health
						</Subtitle1>
						<Caption1
							className={styles.muted}
						>
							{edges.length} edges
						</Caption1>
					</div>
					<div className={styles.tableWrap}>
						<Table aria-label="Edge health">
							<TableHeader>
								<TableRow>
									<TableHeaderCell>
										Edge
									</TableHeaderCell>
									<TableHeaderCell>
										Pass
										rate
									</TableHeaderCell>
									<TableHeaderCell>
										Health
									</TableHeaderCell>
									<TableHeaderCell>
										Last
										mutation
									</TableHeaderCell>
								</TableRow>
							</TableHeader>
							<TableBody>
								{edges.map(
									(e) => {
										const s =
											summaryFor(
												e.id,
											);
										return (
											<TableRow
												key={
													e.id
												}
												className={
													styles.row
												}
												aria-selected={
													e.id ===
													selectedEdgeId
												}
												onClick={() =>
													setSelectedEdgeId(
														e.id,
													)
												}
											>
												<TableCell>
													<Body1>
														{
															e.label
														}
													</Body1>
												</TableCell>
												<TableCell>
													{passRate(
														s,
													)}
												</TableCell>
												<TableCell>
													<HealthBadge
														health={
															s.health
														}
													/>
												</TableCell>
												<TableCell>
													{lastMutationLabel(
														e.id,
														traces,
													)}
												</TableCell>
											</TableRow>
										);
									},
								)}
							</TableBody>
						</Table>
					</div>
				</>
			)}

			{telemetry.lastError ? (
				<ErrorState message={telemetry.lastError} />
			) : null}
			{actionBar}

			<DiffDrawer
				edge={drawerEdge}
				trace={drawerTrace}
				onClose={() => setDrawerEdgeId(null)}
				onOpenDiff={(edgeId) =>
					navigate(`/edges/${edgeId}`)
				}
			/>
		</>
	);
}
