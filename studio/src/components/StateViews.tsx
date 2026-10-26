import {
	Badge,
	Body1,
	Button,
	Card,
	MessageBar,
	MessageBarActions,
	MessageBarBody,
	MessageBarTitle,
	Skeleton,
	SkeletonItem,
	Subtitle2,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { ArrowClockwiseRegular, BoxRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import type { EdgeHealth } from "../types";
import { EDGE_HEALTH_LABEL } from "../lib/metrics";

const useStyles = makeStyles({
	skeleton: { display: "flex", flexDirection: "column", gap: "10px" },
	empty: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		textAlign: "center",
		gap: "12px",
		padding: "40px 24px",
	},
	emptyIcon: {
		fontSize: "64px",
		width: "64px",
		height: "64px",
		color: tokens.colorNeutralForeground3,
	},
});

export function LoadingState({
	rows = 4,
	label = "Loading",
}: {
	rows?: number;
	label?: string;
}) {
	const styles = useStyles();
	return (
		<Skeleton aria-label={label} className={styles.skeleton}>
			{Array.from({ length: rows }, (_, i) => (
				<SkeletonItem
					key={i}
					size={i === 0 ? 28 : 20}
				/>
			))}
		</Skeleton>
	);
}

export function ErrorState({
	message,
	onRetry,
}: {
	message: string;
	onRetry?: () => void;
}) {
	return (
		<MessageBar intent="error">
			<MessageBarBody>
				<MessageBarTitle>
					Couldn't load data
				</MessageBarTitle>
				{message}
			</MessageBarBody>
			{onRetry ? (
				<MessageBarActions>
					<Button
						icon={<ArrowClockwiseRegular />}
						onClick={onRetry}
					>
						Retry
					</Button>
				</MessageBarActions>
			) : null}
		</MessageBar>
	);
}

export function EmptyState({
	title,
	body,
	action,
	icon,
}: {
	title: string;
	body: string;
	action?: ReactNode;
	icon?: ReactNode;
}) {
	const styles = useStyles();
	return (
		<Card appearance="filled-alternative">
			<div className={styles.empty}>
				<span className={styles.emptyIcon}>
					{icon ?? <BoxRegular fontSize={64} />}
				</span>
				<Subtitle2>{title}</Subtitle2>
				<Body1>{body}</Body1>
				{action}
			</div>
		</Card>
	);
}

const HEALTH_COLOR: Record<EdgeHealth, "success" | "warning" | "danger"> = {
	green: "success",
	amber: "warning",
	red: "danger",
};

export function HealthBadge({
	health,
	label,
}: {
	health: EdgeHealth;
	label?: string;
}) {
	return (
		<Badge
			appearance="tint"
			color={HEALTH_COLOR[health]}
			shape="rounded"
		>
			{label ?? EDGE_HEALTH_LABEL[health]}
		</Badge>
	);
}
