import {
	Badge,
	Caption1,
	Subtitle1,
	Tab,
	TabList,
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableHeaderCell,
	TableRow,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { TextBulletListLtrRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { api } from "../api";
import { EmptyState, ErrorState, LoadingState } from "../components/StateViews";
import { useTelemetry } from "../hooks/TelemetryContext";
import { useAsync } from "../hooks/useAsync";
import { formatTime } from "../lib/events";
import type { TelemetryEvent, TelemetryEventResult } from "../types";

type EventTab = "all" | "violations" | "fuzzer";

const useStyles = makeStyles({
	head: {
		display: "flex",
		alignItems: "baseline",
		justifyContent: "space-between",
		gap: "12px",
	},
	muted: { color: tokens.colorNeutralForeground3 },
	mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: "12px" },
	wrap: {
		borderRadius: tokens.borderRadiusMedium,
		border: `1px solid ${tokens.colorNeutralStroke1}`,
		backgroundColor: tokens.colorNeutralBackground3,
	},
	loading: { padding: "16px" },
});

const RESULT_COLOR: Record<
	TelemetryEventResult,
	"informative" | "success" | "danger" | "brand"
> = {
	Started: "informative",
	Pass: "success",
	Violation: "danger",
	Completed: "brand",
};

const FILTERS: Record<EventTab, (e: TelemetryEvent) => boolean> = {
	all: () => true,
	violations: (e) => e.result === "Violation",
	fuzzer: (e) => e.mutated || e.type !== "TRACE_EMITTED",
};

export default function EventLog() {
	const styles = useStyles();
	const telemetry = useTelemetry();
	const topology = useAsync(() => api.getTopology(), []);
	const [tab, setTab] = useState<EventTab>("all");

	const edgeLabel = (edgeId?: string) =>
		edgeId
			? (topology.data?.edges.find((e) => e.id === edgeId)
					?.label ?? edgeId)
			: "—";
	const events = telemetry.events.filter(FILTERS[tab]);
	const passLoading = tab === "fuzzer" && telemetry.isRunning;

	return (
		<>
			<div className={styles.head}>
				<Subtitle1>Event Log</Subtitle1>
				<Caption1 className={styles.muted}>
					{telemetry.events.length} events
				</Caption1>
			</div>
			<TabList
				selectedValue={tab}
				onTabSelect={(_, d) =>
					setTab(d.value as EventTab)
				}
			>
				<Tab value="all">All Events</Tab>
				<Tab value="violations">Violations</Tab>
				<Tab value="fuzzer">Fuzzer Passes</Tab>
			</TabList>

			{telemetry.eventsStatus === "loading" ? (
				<LoadingState rows={6} label="Loading events" />
			) : telemetry.eventsStatus === "error" ? (
				<ErrorState
					message={
						telemetry.eventsError ??
						"Unknown error"
					}
					onRetry={telemetry.reloadEvents}
				/>
			) : events.length === 0 && !passLoading ? (
				<EmptyState
					icon={
						<TextBulletListLtrRegular
							fontSize={64}
						/>
					}
					title="No events in this view"
					body="Start a perturbation pass from the Contract Canvas to stream telemetry here."
				/>
			) : (
				<div className={styles.wrap}>
					{passLoading ? (
						<div className={styles.loading}>
							<LoadingState
								rows={3}
								label="Perturbation pass running"
							/>
						</div>
					) : null}
					<Table aria-label="Telemetry events">
						<TableHeader>
							<TableRow>
								<TableHeaderCell>
									Time
								</TableHeaderCell>
								<TableHeaderCell>
									Event
								</TableHeaderCell>
								<TableHeaderCell>
									Run
								</TableHeaderCell>
								<TableHeaderCell>
									Edge
								</TableHeaderCell>
								<TableHeaderCell>
									Result
								</TableHeaderCell>
							</TableRow>
						</TableHeader>
						<TableBody>
							{events.map((e) => (
								<TableRow
									key={
										e.id
									}
								>
									<TableCell
										className={
											styles.mono
										}
									>
										{formatTime(
											e.time,
										)}
									</TableCell>
									<TableCell
										className={
											styles.mono
										}
									>
										{
											e.type
										}
									</TableCell>
									<TableCell
										className={
											styles.mono
										}
									>
										{
											e.runId
										}
									</TableCell>
									<TableCell>
										{edgeLabel(
											e.edgeId,
										)}
									</TableCell>
									<TableCell>
										<Badge
											appearance="tint"
											color={
												RESULT_COLOR[
													e
														.result
												]
											}
											shape="rounded"
										>
											{
												e.result
											}
										</Badge>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</>
	);
}
