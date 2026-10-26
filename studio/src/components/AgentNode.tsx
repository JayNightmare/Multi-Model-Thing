import {
	Badge,
	Caption1,
	Text,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import {
	BotRegular,
	BranchForkRegular,
	ClipboardTaskRegular,
	DocumentRegular,
} from "@fluentui/react-icons";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { ReactNode } from "react";
import type { AgentStatus } from "../lib/metrics";

export type AgentNodeData = {
	name: string;
	role: string;
	agentId: string;
	latencyMs: number | null;
	status: AgentStatus;
};
export type AgentNodeType = Node<AgentNodeData, "agent">;

const useStyles = makeStyles({
	node: {
		width: "210px",
		display: "flex",
		flexDirection: "column",
		gap: "6px",
		padding: "12px 14px",
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground3,
		border: `1px solid ${tokens.colorNeutralStroke1}`,
		boxShadow: tokens.shadow8,
		color: tokens.colorNeutralForeground1,
		transitionProperty: "transform, box-shadow",
		transitionDuration: "180ms",
		transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
		":hover": {
			transform: "translateY(-2px)",
			boxShadow: tokens.shadow16,
		},
		"@media (prefers-reduced-motion: reduce)": {
			transitionDuration: "0ms",
			":hover": { transform: "none" },
		},
	},
	head: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: "8px",
	},
	title: {
		display: "flex",
		alignItems: "center",
		gap: "6px",
		fontWeight: 600,
	},
	muted: { color: tokens.colorNeutralForeground3 },
	handle: {
		width: "8px",
		height: "8px",
		backgroundColor: tokens.colorNeutralForeground3,
		border: "none",
	},
});

const ICONS: Record<string, ReactNode> = {
	extractor: <DocumentRegular />,
	synthesizer: <BranchForkRegular />,
	"decision-engine": <BotRegular />,
	"audit-logger": <ClipboardTaskRegular />,
};

const STATUS_COLOR: Record<AgentStatus, "success" | "warning" | "danger"> = {
	Healthy: "success",
	Violated: "warning",
	Failing: "danger",
};

export function AgentNode({ data }: NodeProps<AgentNodeType>) {
	const styles = useStyles();
	return (
		<div className={styles.node}>
			<Handle
				type="target"
				position={Position.Left}
				className={styles.handle}
			/>
			<div className={styles.head}>
				<Text className={styles.title}>
					{ICONS[data.agentId] ?? <BotRegular />}
					{data.name}
				</Text>
				<Badge
					appearance="tint"
					color={STATUS_COLOR[data.status]}
					shape="rounded"
				>
					{data.status}
				</Badge>
			</div>
			<Caption1 className={styles.muted}>
				{data.role}
			</Caption1>
			<Caption1 className={styles.muted}>
				Latency ·{" "}
				{data.latencyMs === null
					? "—"
					: `${data.latencyMs} ms`}
			</Caption1>
			<Handle
				type="source"
				position={Position.Right}
				className={styles.handle}
			/>
		</div>
	);
}
