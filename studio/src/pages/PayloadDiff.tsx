import {
	Badge,
	Button,
	Card,
	CardHeader,
	Caption1,
	Field,
	MessageBar,
	MessageBarBody,
	Select,
	Subtitle1,
	Text,
	Toolbar,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import {
	ArrowClockwiseRegular,
	TextBulletListLtrRegular,
} from "@fluentui/react-icons";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api";
import { ContractTable, ReceivedTable } from "../components/DiffTable";
import { EmptyState, ErrorState, LoadingState } from "../components/StateViews";
import { useTelemetry } from "../hooks/TelemetryContext";
import { useAsync } from "../hooks/useAsync";
import { buildDiffRows } from "../lib/diff";
import { formatTime } from "../lib/events";

const useStyles = makeStyles({
	head: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: "12px",
		flexWrap: "wrap",
	},
	controls: { display: "flex", gap: "12px", flexWrap: "wrap" },
	columns: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
		gap: "20px",
	},
	meta: {
		display: "flex",
		gap: "8px",
		alignItems: "center",
		flexWrap: "wrap",
	},
	list: {
		margin: 0,
		paddingLeft: "18px",
		color: tokens.colorNeutralForeground2,
	},
	mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: "12px" },
	actionBar: {
		display: "flex",
		justifyContent: "flex-end",
		gap: "8px",
		padding: "10px 12px",
		borderRadius: tokens.borderRadiusMedium,
		border: `1px solid ${tokens.colorNeutralStroke1}`,
		backgroundColor: tokens.colorNeutralBackground3,
	},
});

export function PayloadDiffIndex() {
	const topology = useAsync(() => api.getTopology(), []);
	if (topology.status === "loading")
		return <LoadingState rows={5} label="Loading edges" />;
	if (topology.status === "error")
		return (
			<ErrorState
				message={topology.error ?? "Unknown error"}
				onRetry={topology.reload}
			/>
		);
	const first = topology.data?.edges[0];
	if (!first) {
		return (
			<EmptyState
				title="No edges to compare"
				body="Register agents and edges before inspecting payload diffs."
			/>
		);
	}
	return <Navigate to={`/edges/${first.id}`} replace />;
}

export default function PayloadDiff() {
	const styles = useStyles();
	const navigate = useNavigate();
	const { edgeId = "" } = useParams();
	const telemetry = useTelemetry();
	const [traceId, setTraceId] = useState<string>("");

	const topology = useAsync(() => api.getTopology(), []);
	const traces = useAsync(
		() => api.listTraces({ edgeId }),
		[edgeId, telemetry.completedRuns],
	);

	const edge = topology.data?.edges.find((e) => e.id === edgeId);
	const mutated = (traces.data ?? []).filter(
		(t) => t.mutationType !== "NONE",
	);
	const selectable = mutated.length > 0 ? mutated : (traces.data ?? []);
	const defaultTrace =
		selectable.find((t) => t.contractViolated) ?? selectable[0];
	const trace =
		selectable.find((t) => t.traceId === traceId) ?? defaultTrace;

	useEffect(() => setTraceId(""), [edgeId]);

	const loading =
		topology.status === "loading" || traces.status === "loading";
	const failed =
		topology.status === "error"
			? topology
			: traces.status === "error"
				? traces
				: null;

	const rows = edge && trace ? buildDiffRows(edge, trace) : [];

	return (
		<>
			<div className={styles.head}>
				<Subtitle1>
					{edge?.label ?? "Payload Diff"}
				</Subtitle1>
				<div className={styles.controls}>
					<Field label="Edge">
						<Select
							value={edgeId}
							onChange={(_, d) =>
								navigate(
									`/edges/${d.value}`,
								)
							}
						>
							{(
								topology.data
									?.edges ??
								[]
							).map((e) => (
								<option
									key={
										e.id
									}
									value={
										e.id
									}
								>
									{
										e.label
									}
								</option>
							))}
						</Select>
					</Field>
					<Field label="Trace">
						<Select
							value={
								trace?.traceId ??
								""
							}
							onChange={(_, d) =>
								setTraceId(
									d.value,
								)
							}
							disabled={
								selectable.length ===
								0
							}
						>
							{selectable.map((t) => (
								<option
									key={
										t.traceId
									}
									value={
										t.traceId
									}
								>
									{formatTime(
										t.timestamp,
									)}{" "}
									·{" "}
									{t.strategy ??
										t.mutationType}
								</option>
							))}
						</Select>
					</Field>
				</div>
			</div>

			{loading ? (
				<LoadingState
					rows={6}
					label="Loading payload diff"
				/>
			) : failed ? (
				<ErrorState
					message={
						failed.error ?? "Unknown error"
					}
					onRetry={() => {
						topology.reload();
						traces.reload();
					}}
				/>
			) : !edge ? (
				<EmptyState
					title="Unknown edge"
					body={`No edge named "${edgeId}" exists in this workflow.`}
				/>
			) : !trace ? (
				<EmptyState
					icon={
						<TextBulletListLtrRegular
							fontSize={64}
						/>
					}
					title="No traces for this edge"
					body="Retest the edge to capture a contract payload and its mutated counterpart."
					action={
						<Button
							appearance="primary"
							icon={
								<ArrowClockwiseRegular />
							}
							disabled={
								!telemetry.isConnected ||
								telemetry.isRunning
							}
							onClick={() =>
								telemetry.triggerRun(
									"heuristic",
									edge.id,
								)
							}
						>
							Retest Edge
						</Button>
					}
				/>
			) : (
				<>
					{trace.fuzzerFallback ? (
						<MessageBar intent="warning">
							<MessageBarBody>
								Couldn't reach
								semantic fuzzer
								— fell back to
								heuristic
								mutations.
							</MessageBarBody>
						</MessageBar>
					) : null}
					<div className={styles.meta}>
						<Badge
							appearance="outline"
							shape="rounded"
						>
							strategy:{" "}
							{trace.strategy ??
								trace.mutationType}
						</Badge>
						<Badge
							appearance="tint"
							color={
								trace.contractViolated
									? "danger"
									: "success"
							}
							shape="rounded"
						>
							{trace.contractViolated
								? "Contract violated"
								: "Contract intact"}
						</Badge>
						<Badge
							appearance="tint"
							color={
								trace.downstreamStatus ===
								"FAILED"
									? "danger"
									: trace.downstreamStatus ===
										  "BYPASSED"
										? "warning"
										: "success"
							}
							shape="rounded"
						>
							Downstream{" "}
							{trace.downstreamStatus.toLowerCase()}
						</Badge>
						<Caption1>
							{trace.runId} ·{" "}
							{trace.durationMs} ms
						</Caption1>
					</div>
					<div className={styles.columns}>
						<Card>
							<CardHeader
								header={
									<Text weight="semibold">
										Contract
									</Text>
								}
							/>
							<ContractTable
								rows={rows}
							/>
						</Card>
						<Card>
							<CardHeader
								header={
									<Text weight="semibold">
										Received
									</Text>
								}
							/>
							<ReceivedTable
								rows={rows}
							/>
						</Card>
					</div>
					{trace.violations.length > 0 ? (
						<Card>
							<CardHeader
								header={
									<Text weight="semibold">
										Zod
										issues
									</Text>
								}
							/>
							<ul
								className={
									styles.list
								}
							>
								{trace.violations.map(
									(
										v,
										i,
									) => (
										<li
											key={
												i
											}
											className={
												styles.mono
											}
										>
											{
												v.path
											}
											:{" "}
											{
												v.message
											}
										</li>
									),
								)}
							</ul>
							{trace.caughtError ? (
								<Caption1
									className={
										styles.mono
									}
								>
									{
										trace.caughtError
									}
								</Caption1>
							) : null}
						</Card>
					) : null}
					<Toolbar className={styles.actionBar}>
						<Button
							icon={
								<TextBulletListLtrRegular />
							}
							onClick={() =>
								navigate(
									"/events",
								)
							}
						>
							Open event log
						</Button>
						<Button
							appearance="primary"
							icon={
								<ArrowClockwiseRegular />
							}
							disabled={
								!telemetry.isConnected ||
								telemetry.isRunning
							}
							onClick={() =>
								telemetry.triggerRun(
									"semantic",
									edge.id,
								)
							}
						>
							Retest Edge
						</Button>
					</Toolbar>
				</>
			)}
		</>
	);
}
