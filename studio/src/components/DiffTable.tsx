import {
	Badge,
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableHeaderCell,
	TableRow,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import type { DiffResult, DiffRow } from "../lib/diff";

const useStyles = makeStyles({
	mono: {
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: "12px",
		wordBreak: "break-word",
	},
});

const RESULT_COLOR: Record<DiffResult, "success" | "danger" | "warning"> = {
	Match: "success",
	Mismatch: "danger",
	Missing: "warning",
	Injected: "warning",
};

export function ResultBadge({ result }: { result: DiffResult }) {
	return (
		<Badge
			appearance="tint"
			color={RESULT_COLOR[result]}
			shape="rounded"
		>
			{result}
		</Badge>
	);
}

export function ContractTable({ rows }: { rows: DiffRow[] }) {
	const styles = useStyles();
	return (
		<Table size="small" aria-label="Contract expectations">
			<TableHeader>
				<TableRow>
					<TableHeaderCell>Field</TableHeaderCell>
					<TableHeaderCell>
						Contract (expected)
					</TableHeaderCell>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((r) => (
					<TableRow key={r.field}>
						<TableCell
							className={styles.mono}
						>
							{r.field}
						</TableCell>
						<TableCell
							className={styles.mono}
						>
							{r.expected}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

export function ReceivedTable({ rows }: { rows: DiffRow[] }) {
	const styles = useStyles();
	return (
		<Table size="small" aria-label="Received payload">
			<TableHeader>
				<TableRow>
					<TableHeaderCell>Field</TableHeaderCell>
					<TableHeaderCell>
						Received (mutated)
					</TableHeaderCell>
					<TableHeaderCell>
						Result
					</TableHeaderCell>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((r) => (
					<TableRow key={r.field}>
						<TableCell
							className={styles.mono}
						>
							{r.field}
						</TableCell>
						<TableCell
							className={styles.mono}
						>
							{r.received}
						</TableCell>
						<TableCell>
							<ResultBadge
								result={
									r.result
								}
							/>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
