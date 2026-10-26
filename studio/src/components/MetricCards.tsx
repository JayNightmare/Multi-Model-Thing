import {
	Caption1,
	Card,
	Text,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import {
	DataBarVerticalRegular,
	ShieldCheckmarkRegular,
	ShieldErrorRegular,
	TimerRegular,
} from "@fluentui/react-icons";
import type { ReactNode } from "react";
import type { RunMetrics } from "../types";

const useStyles = makeStyles({
	row: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
		gap: "12px",
	},
	card: { gap: "6px", padding: "14px 16px" },
	label: {
		display: "flex",
		alignItems: "center",
		gap: "6px",
		textTransform: "uppercase",
		letterSpacing: "0.05em",
		color: tokens.colorNeutralForeground3,
		fontWeight: 600,
	},
	value: { fontSize: "26px", fontWeight: 700, lineHeight: 1.1 },
	delta: { color: tokens.colorNeutralForeground3 },
});

function Tile({
	label,
	icon,
	value,
	delta,
}: {
	label: string;
	icon: ReactNode;
	value: string;
	delta?: string;
}) {
	const styles = useStyles();
	return (
		<Card className={styles.card} size="small">
			<Caption1 className={styles.label}>
				{icon}
				{label}
			</Caption1>
			<Text className={styles.value}>{value}</Text>
			{delta ? (
				<Caption1 className={styles.delta}>
					{delta}
				</Caption1>
			) : null}
		</Card>
	);
}

export function MetricCards({ metrics }: { metrics: RunMetrics }) {
	const styles = useStyles();
	const share =
		metrics.contractsChecked > 0
			? Math.round(
					(metrics.violations /
						metrics.contractsChecked) *
						1000,
				) / 10
			: 0;
	return (
		<div className={styles.row}>
			<Tile
				label="Contracts Checked"
				icon={<DataBarVerticalRegular />}
				value={String(metrics.contractsChecked)}
			/>
			<Tile
				label="Violations"
				icon={<ShieldErrorRegular />}
				value={String(metrics.violations)}
				delta={`${share}% of checks`}
			/>
			<Tile
				label="Recovered"
				icon={<ShieldCheckmarkRegular />}
				value={String(metrics.recovered)}
				delta={`${metrics.recoveryRate}% recovery rate`}
			/>
			<Tile
				label="Avg Latency"
				icon={<TimerRegular />}
				value={`${metrics.avgLatencyMs} ms`}
			/>
		</div>
	);
}
