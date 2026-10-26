import { makeStyles, tokens } from "@fluentui/react-components";
import {
	BaseEdge,
	EdgeLabelRenderer,
	getBezierPath,
	type Edge,
	type EdgeProps,
} from "@xyflow/react";
import type { EdgeHealth } from "../types";

export type HealthEdgeData = {
	health: EdgeHealth;
	passRate: string;
	selected: boolean;
};
export type HealthEdgeType = Edge<HealthEdgeData, "health">;

export const HEALTH_STROKE: Record<EdgeHealth, string> = {
	green: "#22c55e",
	amber: "#f59e0b",
	red: "#ef4444",
};

const useStyles = makeStyles({
	label: {
		position: "absolute",
		padding: "2px 8px",
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground3,
		border: `1px solid ${tokens.colorNeutralStroke1}`,
		fontSize: "11px",
		fontFamily: tokens.fontFamilyMonospace,
		color: tokens.colorNeutralForeground2,
		pointerEvents: "all",
		cursor: "pointer",
	},
});

export function HealthEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	data,
}: EdgeProps<HealthEdgeType>) {
	const styles = useStyles();
	const [path, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	});
	const color = HEALTH_STROKE[data?.health ?? "green"];

	return (
		<>
			<BaseEdge
				id={id}
				path={path}
				style={{
					stroke: color,
					strokeWidth: data?.selected ? 4 : 2.5,
					filter: `drop-shadow(0 0 ${data?.selected ? 6 : 3}px ${color})`,
				}}
			/>
			<EdgeLabelRenderer>
				<div
					className={styles.label}
					style={{
						transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
						color,
					}}
				>
					{data?.passRate}
				</div>
			</EdgeLabelRenderer>
		</>
	);
}
