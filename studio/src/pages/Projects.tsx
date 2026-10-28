import {
	Badge,
	Body1,
	Button,
	Caption1,
	Dialog,
	DialogActions,
	DialogBody,
	DialogContent,
	DialogSurface,
	DialogTitle,
	DialogTrigger,
	Field,
	Input,
	MessageBar,
	MessageBarBody,
	Subtitle1,
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableHeaderCell,
	TableRow,
	Title2,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { AddRegular, DeleteRegular } from "@fluentui/react-icons";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useProject } from "../hooks/ProjectContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { ROUTES } from "../lib/routes";

const useStyles = makeStyles({
	form: {
		display: "flex",
		alignItems: "end",
		gap: "12px",
		flexWrap: "wrap",
	},
	tableWrap: {
		borderRadius: tokens.borderRadiusMedium,
		border: `1px solid ${tokens.colorNeutralStroke1}`,
		overflowX: "auto",
	},
	mono: { fontFamily: tokens.fontFamilyMonospace },
	actions: { display: "flex", gap: "8px" },
	muted: { color: tokens.colorNeutralForeground3 },
});

export default function Projects() {
	const styles = useStyles();
	const navigate = useNavigate();
	const { projects, projectId, select, create, remove } = useProject();
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	useDocumentTitle("Projects");

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			await create(name.trim());
			setName("");
			navigate(ROUTES.connectGuide);
		} catch (e) {
			setError(
				e instanceof Error
					? e.message
					: "Could not create the project",
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<Title2 as="h1">Projects</Title2>
			<Body1 className={styles.muted}>
				A project holds the contracts, runs and results
				for one set of agents. Only you can see your
				projects; the demo project is shared. Normally
				an AI assistant creates one for you through the{" "}
				<Link to={ROUTES.connectGuide}>MCP server</Link>
				.
			</Body1>

			<form className={styles.form} onSubmit={submit}>
				<Field label="New project name">
					<Input
						value={name}
						maxLength={80}
						onChange={(_, d) =>
							setName(d.value)
						}
					/>
				</Field>
				<Button
					type="submit"
					appearance="primary"
					icon={<AddRegular />}
					disabled={busy || name.trim() === ""}
				>
					Create project
				</Button>
			</form>
			{error ? (
				<MessageBar intent="error">
					<MessageBarBody>{error}</MessageBarBody>
				</MessageBar>
			) : null}

			<Subtitle1 as="h2">Your projects</Subtitle1>
			<div className={styles.tableWrap}>
				<Table aria-label="Projects">
					<TableHeader>
						<TableRow>
							<TableHeaderCell>
								Name
							</TableHeaderCell>
							<TableHeaderCell>
								Id
							</TableHeaderCell>
							<TableHeaderCell>
								Edges
							</TableHeaderCell>
							<TableHeaderCell>
								Created
							</TableHeaderCell>
							<TableHeaderCell />
						</TableRow>
					</TableHeader>
					<TableBody>
						{projects.map((p) => (
							<TableRow
								key={
									p.projectId
								}
							>
								<TableCell>
									<Body1>
										{
											p.name
										}
									</Body1>{" "}
									{p.isDemo ? (
										<Badge
											appearance="tint"
											color="informative"
										>
											Demo
										</Badge>
									) : null}
									{p.projectId ===
									projectId ? (
										<Badge
											appearance="tint"
											color="brand"
										>
											Open
										</Badge>
									) : null}
								</TableCell>
								<TableCell
									className={
										styles.mono
									}
								>
									<Caption1>
										{
											p.projectId
										}
									</Caption1>
								</TableCell>
								<TableCell>
									{
										p.edgeCount
									}
								</TableCell>
								<TableCell>
									{new Date(
										p.createdAt,
									).toLocaleDateString()}
								</TableCell>
								<TableCell>
									<div
										className={
											styles.actions
										}
									>
										<Button
											size="small"
											disabled={
												p.projectId ===
												projectId
											}
											onClick={() => {
												select(
													p.projectId,
												);
												navigate(
													ROUTES.app,
												);
											}}
										>
											Open
										</Button>
										{p.isDemo ? null : (
											<Dialog>
												<DialogTrigger
													disableButtonEnhancement
												>
													<Button
														size="small"
														icon={
															<DeleteRegular />
														}
														aria-label={`Delete ${p.name}`}
													/>
												</DialogTrigger>
												<DialogSurface>
													<DialogBody>
														<DialogTitle>
															Delete
															"
															{
																p.name
															}
															"?
														</DialogTitle>
														<DialogContent>
															This
															removes
															its
															workflow,
															runs
															and
															traces
															permanently.
															An
															assistant
															connected
															to
															a
															workspace
															for
															this
															project
															will
															need{" "}
															<b>
																mml_init
															</b>{" "}
															with{" "}
															<b>
																force
															</b>{" "}
															to
															create
															a
															new
															one.
														</DialogContent>
														<DialogActions>
															<DialogTrigger
																disableButtonEnhancement
															>
																<Button appearance="secondary">
																	Cancel
																</Button>
															</DialogTrigger>
															<DialogTrigger
																disableButtonEnhancement
															>
																<Button
																	appearance="primary"
																	onClick={() =>
																		void remove(
																			p.projectId,
																		)
																	}
																>
																	Delete
																</Button>
															</DialogTrigger>
														</DialogActions>
													</DialogBody>
												</DialogSurface>
											</Dialog>
										)}
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</>
	);
}
