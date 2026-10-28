import {
	Body1,
	Caption1,
	Card,
	Subtitle1,
	Title2,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import type { ReactNode } from "react";

const useStyles = makeStyles({
	section: {
		display: "flex",
		flexDirection: "column",
		gap: "16px",
		padding: "40px 0",
	},
	lead: {
		maxWidth: "70ch",
		color: tokens.colorNeutralForeground2,
	},
	grid: {
		display: "grid",
		gap: "16px",
		gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
	},
	code: {
		margin: 0,
		padding: "12px",
		overflowX: "auto",
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground3,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
		lineHeight: tokens.lineHeightBase200,
	},
	card: { height: "100%" },
	cardBody: {
		display: "flex",
		flexDirection: "column",
		gap: "8px",
	},
	step: {
		display: "grid",
		placeItems: "center",
		width: "28px",
		height: "28px",
		borderRadius: "50%",
		backgroundColor: tokens.colorBrandBackground,
		color: tokens.colorNeutralForegroundOnBrand,
		fontWeight: 700,
	},
});

export function Section({
	id,
	title,
	lead,
	children,
}: {
	id?: string;
	title: string;
	lead?: string;
	children?: ReactNode;
}) {
	const styles = useStyles();
	return (
		<section
			id={id}
			className={styles.section}
			aria-labelledby={id ? `${id}-title` : undefined}
		>
			<Title2 id={id ? `${id}-title` : undefined} as="h2">
				{title}
			</Title2>
			{lead ? (
				<Body1 className={styles.lead}>{lead}</Body1>
			) : null}
			{children}
		</section>
	);
}

export function CardGrid({ children }: { children: ReactNode }) {
	const styles = useStyles();
	return <div className={styles.grid}>{children}</div>;
}

export function InfoCard({
	title,
	caption,
	step,
	children,
}: {
	title: string;
	caption?: string;
	step?: number;
	children?: ReactNode;
}) {
	const styles = useStyles();
	return (
		<Card className={styles.card}>
			<div className={styles.cardBody}>
				{step ? (
					<span
						className={styles.step}
						aria-hidden="true"
					>
						{step}
					</span>
				) : null}
				<Subtitle1 as="h3">{title}</Subtitle1>
				{caption ? (
					<Caption1>{caption}</Caption1>
				) : null}
				{children}
			</div>
		</Card>
	);
}

export function CodeBlock({
	children,
	label,
}: {
	children: string;
	label: string;
}) {
	const styles = useStyles();
	return (
		<pre className={styles.code} aria-label={label}>
			<code>{children}</code>
		</pre>
	);
}
