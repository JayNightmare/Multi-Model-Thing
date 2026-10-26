import {
	Body1,
	Button,
	Caption1,
	Title2,
	makeStyles,
} from "@fluentui/react-components";
import type { ReactElement } from "react";

const useStyles = makeStyles({
	root: {
		position: "relative",
		overflow: "hidden",
		display: "flex",
		flexDirection: "column",
		gap: "10px",
		padding: "24px 28px",
		borderRadius: "8px",
		background: "linear-gradient(135deg, #38bdf8 0%, #7dd3fc 35%, #a78bfa 100%)",
		color: "#04121c",
		boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
	},
	mesh: {
		position: "absolute",
		inset: 0,
		width: "100%",
		height: "100%",
		pointerEvents: "none",
		opacity: 0.7,
	},
	content: {
		position: "relative",
		display: "flex",
		flexDirection: "column",
		gap: "10px",
	},
	eyebrow: {
		display: "flex",
		alignItems: "center",
		gap: "6px",
		textTransform: "uppercase",
		letterSpacing: "0.12em",
		fontWeight: 700,
		color: "#04121c",
	},
	dot: {
		width: "6px",
		height: "6px",
		borderRadius: "50%",
		backgroundColor: "#04121c",
	},
	title: {
		maxWidth: "24ch",
		lineHeight: 1.1,
		letterSpacing: "-0.02em",
		color: "#04121c",
	},
	subtitle: { maxWidth: "60ch", opacity: 0.9, color: "#04121c" },
	actions: {
		display: "flex",
		gap: "10px",
		flexWrap: "wrap",
		marginTop: "6px",
	},
	primary: {
		backgroundColor: "#04121c",
		color: "#e2e8f0",
		":hover": { backgroundColor: "#0b1b2b", color: "#fff" },
	},
	secondary: {
		backgroundColor: "transparent",
		color: "#04121c",
		border: "1px solid rgba(4,18,28,0.55)",
	},
});

interface HeroAction {
	label: string;
	icon: ReactElement;
	onClick: () => void;
	disabled?: boolean;
}

export function Hero({
	eyebrow,
	title,
	subtitle,
	primary,
	secondary,
}: {
	eyebrow: string;
	title: string;
	subtitle: string;
	primary: HeroAction;
	secondary: HeroAction;
}) {
	const styles = useStyles();
	return (
		<section className={styles.root}>
			<svg
				className={styles.mesh}
				aria-hidden="true"
				viewBox="0 0 800 400"
				preserveAspectRatio="none"
			>
				<defs>
					<radialGradient
						id="mesh-a"
						cx="0%"
						cy="0%"
						r="80%"
					>
						<stop
							offset="0%"
							stopColor="#a78bfa"
							stopOpacity="0.55"
						/>
						<stop
							offset="100%"
							stopColor="#a78bfa"
							stopOpacity="0"
						/>
					</radialGradient>
					<radialGradient
						id="mesh-b"
						cx="100%"
						cy="100%"
						r="80%"
					>
						<stop
							offset="0%"
							stopColor="#38bdf8"
							stopOpacity="0.55"
						/>
						<stop
							offset="100%"
							stopColor="#38bdf8"
							stopOpacity="0"
						/>
					</radialGradient>
				</defs>
				<rect
					width="800"
					height="400"
					fill="url(#mesh-a)"
				/>
				<rect
					width="800"
					height="400"
					fill="url(#mesh-b)"
				/>
			</svg>
			<div className={styles.content}>
				<Caption1 className={styles.eyebrow}>
					<span className={styles.dot} />
					{eyebrow}
				</Caption1>
				<Title2 as="h1" className={styles.title}>
					{title}
				</Title2>
				<Body1 className={styles.subtitle}>
					{subtitle}
				</Body1>
				<div className={styles.actions}>
					<Button
						className={styles.primary}
						icon={primary.icon}
						onClick={primary.onClick}
						disabled={primary.disabled}
					>
						{primary.label}
					</Button>
					<Button
						className={styles.secondary}
						appearance="outline"
						icon={secondary.icon}
						onClick={secondary.onClick}
						disabled={secondary.disabled}
					>
						{secondary.label}
					</Button>
				</div>
			</div>
		</section>
	);
}
