import {
	Button,
	Card,
	Checkbox,
	Field,
	Input,
	Select,
	Subtitle1,
	Switch,
	Textarea,
	Toolbar,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { ArrowDownloadRegular, DocumentRegular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { EmptyState, ErrorState, LoadingState } from "../components/StateViews";
import { useAsync } from "../hooks/useAsync";
import { exportHtmlReport } from "../lib/exportReport";
import { metricsFromTraces } from "../lib/metrics";

const useStyles = makeStyles({
	form: {
		display: "flex",
		flexDirection: "column",
		gap: "16px",
		maxWidth: "720px",
	},
	strategies: { display: "flex", flexWrap: "wrap", gap: "4px 16px" },
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

const NOTES_LIMIT = 500;

export default function ReportExport() {
	const styles = useStyles();
	const topology = useAsync(() => api.getTopology(), []);
	const runs = useAsync(() => api.listRuns(), []);
	const [runId, setRunId] = useState("");
	const [title, setTitle] = useState("");
	const [notes, setNotes] = useState("");
	const [includeDiffs, setIncludeDiffs] = useState(true);
	const [excluded, setExcluded] = useState<string[]>([]);

	const selectedRunId = runId || runs.data?.[0]?.runId || "";
	const traces = useAsync(
		() =>
			selectedRunId
				? api.listTraces({ runId: selectedRunId })
				: Promise.resolve([]),
		[selectedRunId],
	);

	const run = runs.data?.find((r) => r.runId === selectedRunId);
	const strategies = useMemo(
		() => [
			...new Set(
				(traces.data ?? [])
					.filter(
						(t) =>
							t.mutationType !==
							"NONE",
					)
					.map(
						(t) =>
							t.strategy ??
							t.mutationType,
					),
			),
		],
		[traces.data],
	);

	// Pre-fill title and notes whenever the selected run changes.
	useEffect(() => {
		if (!selectedRunId) return;
		setTitle(`Contract Test Report — ${selectedRunId}`);
		setExcluded([]);
		const worst = [...(run?.edges ?? [])].sort(
			(a, b) =>
				b.violations / Math.max(b.total, 1) -
				a.violations / Math.max(a.total, 1),
		)[0];
		const edge = topology.data?.edges.find(
			(e) => e.id === worst?.edgeId,
		);
		const target = topology.data?.agents.find(
			(a) => a.id === edge?.target,
		);
		setNotes(
			worst && target && worst.violations > 0
				? `${target.name} edge fails ${worst.violations} of ${worst.total} mutated payloads`
				: "",
		);
	}, [selectedRunId, run, topology.data]);

	const titleInvalid = title.trim() === "";
	const notesLong = notes.length > NOTES_LIMIT;
	const included = (traces.data ?? []).filter(
		(t) =>
			t.mutationType === "NONE" ||
			!excluded.includes(t.strategy ?? t.mutationType),
	);
	const canExport = !titleInvalid && !notesLong && included.length > 0;

	const failed =
		runs.status === "error"
			? runs
			: traces.status === "error"
				? traces
				: null;
	const loading =
		runs.status === "loading" || topology.status === "loading";

	const doExport = () =>
		exportHtmlReport({
			title: title.trim(),
			notes: notes.trim(),
			includeDiffs,
			strategies: strategies.filter(
				(s) => !excluded.includes(s),
			),
			metrics: metricsFromTraces(selectedRunId, included),
			traces: included,
		});

	return (
		<>
			<Subtitle1>Report Export</Subtitle1>
			{loading ? (
				<LoadingState rows={6} label="Loading runs" />
			) : failed ? (
				<ErrorState
					message={
						failed.error ?? "Unknown error"
					}
					onRetry={() => {
						runs.reload();
						traces.reload();
					}}
				/>
			) : (runs.data ?? []).length === 0 ? (
				<EmptyState
					icon={<DocumentRegular fontSize={64} />}
					title="No runs to export"
					body="Complete a perturbation pass first, then export its results as a standalone HTML report."
				/>
			) : (
				<>
					<Card>
						<div className={styles.form}>
							<Field
								label="Report title"
								required
								validationState={
									titleInvalid
										? "error"
										: "none"
								}
								validationMessage={
									titleInvalid
										? "A report title is required."
										: undefined
								}
							>
								<Input
									value={
										title
									}
									onChange={(
										_,
										d,
									) =>
										setTitle(
											d.value,
										)
									}
								/>
							</Field>
							<Field label="Run">
								<Select
									value={
										selectedRunId
									}
									onChange={(
										_,
										d,
									) =>
										setRunId(
											d.value,
										)
									}
								>
									{(
										runs.data ??
										[]
									).map(
										(
											r,
											i,
										) => (
											<option
												key={
													r.runId
												}
												value={
													r.runId
												}
											>
												{
													r.runId
												}
												{i ===
												0
													? " (latest)"
													: ""}
											</option>
										),
									)}
								</Select>
							</Field>
							<Field label="Strategies">
								{strategies.length ===
								0 ? (
									"No mutated traces in this run."
								) : (
									<div
										className={
											styles.strategies
										}
									>
										{strategies.map(
											(
												s,
											) => (
												<Checkbox
													key={
														s
													}
													label={
														s
													}
													checked={
														!excluded.includes(
															s,
														)
													}
													onChange={(
														_,
														d,
													) =>
														setExcluded(
															(
																prev,
															) =>
																d.checked
																	? prev.filter(
																			(
																				x,
																			) =>
																				x !==
																				s,
																		)
																	: [
																			...prev,
																			s,
																		],
														)
													}
												/>
											),
										)}
									</div>
								)}
							</Field>
							<Switch
								label="Include payload diffs"
								checked={
									includeDiffs
								}
								onChange={(
									_,
									d,
								) =>
									setIncludeDiffs(
										d.checked,
									)
								}
							/>
							<Field
								label="Notes"
								validationState={
									notesLong
										? "warning"
										: "none"
								}
								validationMessage={
									notesLong
										? `Notes are limited to ${NOTES_LIMIT} characters (${notes.length}).`
										: undefined
								}
							>
								<Textarea
									value={
										notes
									}
									onChange={(
										_,
										d,
									) =>
										setNotes(
											d.value,
										)
									}
									rows={3}
								/>
							</Field>
						</div>
					</Card>
					<Toolbar className={styles.actionBar}>
						<Button
							appearance="primary"
							icon={
								<ArrowDownloadRegular />
							}
							disabled={!canExport}
							onClick={doExport}
						>
							Export HTML report
						</Button>
					</Toolbar>
				</>
			)}
		</>
	);
}
