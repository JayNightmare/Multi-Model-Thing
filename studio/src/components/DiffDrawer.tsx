import {
	Badge,
	Body1,
	Button,
	Caption1,
	DrawerBody,
	DrawerHeader,
	DrawerHeaderTitle,
	OverlayDrawer,
	Subtitle2,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { ArrowSwapRegular, DismissRegular } from "@fluentui/react-icons";
import { buildDiffRows } from "../lib/diff";
import type { EdgeInfo, TraceRecord } from "../types";
import { ReceivedTable } from "./DiffTable";

const useStyles = makeStyles({
	body: { display: "flex", flexDirection: "column", gap: "14px" },
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
});

export function DiffDrawer({
	edge,
	trace,
	onClose,
	onOpenDiff,
}: {
	edge: EdgeInfo | null;
	trace: TraceRecord | null;
	onClose: () => void;
	onOpenDiff: (edgeId: string) => void;
}) {
	const styles = useStyles();
	return (
		<OverlayDrawer
			open={edge !== null}
			position="end"
			size="medium"
			onOpenChange={(_, d) => !d.open && onClose()}
		>
			<DrawerHeader>
				<DrawerHeaderTitle
					action={
						<Button
							appearance="subtle"
							aria-label="Close"
							icon={
								<DismissRegular />
							}
							onClick={onClose}
						/>
					}
				>
					{edge?.label}
				</DrawerHeaderTitle>
			</DrawerHeader>
			<DrawerBody>
				<div className={styles.body}>
					{trace && edge ? (
						<>
							<div
								className={
									styles.meta
								}
							>
								<Badge
									appearance="outline"
									shape="rounded"
								>
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
								<Caption1>
									{
										trace.downstreamStatus
									}
								</Caption1>
							</div>
							<ReceivedTable
								rows={buildDiffRows(
									edge,
									trace,
								)}
							/>
							{trace.violations
								.length > 0 ? (
								<div>
									<Subtitle2>
										Zod
										issues
									</Subtitle2>
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
								</div>
							) : null}
							<Button
								appearance="primary"
								icon={
									<ArrowSwapRegular />
								}
								onClick={() =>
									onOpenDiff(
										edge.id,
									)
								}
							>
								Open full
								payload diff
							</Button>
						</>
					) : (
						<Body1>
							No traces recorded for
							this edge yet.
						</Body1>
					)}
				</div>
			</DrawerBody>
		</OverlayDrawer>
	);
}
