import {
	Avatar,
	Badge,
	Button,
	Caption1,
	Divider,
	Subtitle2,
	Tab,
	TabList,
	Tooltip,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import {
	ArrowDownloadRegular,
	ArrowSwapRegular,
	DesktopRegular,
	GridRegular,
	PlugConnectedRegular,
	PlugDisconnectedRegular,
	TextBulletListLtrRegular,
	WeatherMoonRegular,
	WeatherSunnyRegular,
} from "@fluentui/react-icons";
import { motion, useReducedMotion } from "motion/react";
import type { ReactElement, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useTelemetry } from "../hooks/TelemetryContext";
import { useAsync } from "../hooks/useAsync";
import { useThemeMode, type ThemeMode } from "../theme/theme";

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		minHeight: "100vh",
		backgroundColor: tokens.colorNeutralBackground1,
		color: tokens.colorNeutralForeground1,
	},
	header: {
		position: "sticky",
		top: 0,
		zIndex: 5,
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: "16px",
		padding: "10px 24px",
		backgroundColor: tokens.colorNeutralBackground3,
		borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
		boxShadow: tokens.shadow4,
	},
	brand: {
		display: "flex",
		alignItems: "center",
		gap: "12px",
		fontWeight: 700,
	},
	logo: {
		width: "28px",
		height: "28px",
		display: "grid",
		placeItems: "center",
		borderRadius: tokens.borderRadiusSmall,
		backgroundColor: tokens.colorBrandBackground,
		color: tokens.colorNeutralForegroundOnBrand,
		fontSize: "12px",
		fontWeight: 700,
	},
	actions: { display: "flex", alignItems: "center", gap: "12px" },
	live: {
		display: "flex",
		alignItems: "center",
		gap: "6px",
		color: tokens.colorNeutralForeground3,
	},
	shell: { display: "flex", flex: 1, minHeight: 0 },
	sidebar: {
		width: "220px",
		flexShrink: 0,
		padding: "12px 8px",
		backgroundColor: tokens.colorNeutralBackground2,
		borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
		display: "flex",
		flexDirection: "column",
		gap: "4px",
	},
	section: {
		padding: "8px 12px 4px",
		textTransform: "uppercase",
		letterSpacing: "0.06em",
		color: tokens.colorNeutralForeground3,
		fontWeight: 600,
	},
	main: {
		flex: 1,
		minWidth: 0,
		padding: "24px",
		display: "flex",
		flexDirection: "column",
		gap: "20px",
	},
});

const NAV = [
	{ value: "/", label: "Contract Canvas", icon: <GridRegular /> },
	{ value: "/edges", label: "Payload Diff", icon: <ArrowSwapRegular /> },
	{
		value: "/events",
		label: "Event Log",
		icon: <TextBulletListLtrRegular />,
	},
	{
		value: "/report",
		label: "Report Export",
		icon: <ArrowDownloadRegular />,
	},
];

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
	dark: "light",
	light: "system",
	system: "dark",
};
const MODE_ICON: Record<ThemeMode, ReactElement> = {
	dark: <WeatherMoonRegular />,
	light: <WeatherSunnyRegular />,
	system: <DesktopRegular />,
};

function activeNav(pathname: string): string {
	if (pathname.startsWith("/edges")) return "/edges";
	if (pathname.startsWith("/events")) return "/events";
	if (pathname.startsWith("/report")) return "/report";
	return "/";
}

function GatewayStatus() {
	const health = useAsync(() => api.getHealth(), []);
	if (health.status !== "ready" || !health.data) return null;
	const color =
		health.data.status === "healthy"
			? "success"
			: health.data.status === "degraded"
				? "warning"
				: "danger";
	const detail =
		health.data.fuzzer === "down"
			? "fuzzer offline"
			: "fuzzer online";
	return (
		<Tooltip
			content={`DuckDB ${health.data.duckdb} · ${detail}`}
			relationship="description"
		>
			<Badge appearance="tint" color={color} shape="rounded">
				Gateway {health.data.status}
			</Badge>
		</Tooltip>
	);
}

export function AppShell({ children }: { children: ReactNode }) {
	const styles = useStyles();
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const { isConnected } = useTelemetry();
	const { mode, setMode } = useThemeMode();
	const reduceMotion = useReducedMotion();

	return (
		<div className={styles.root}>
			<header className={styles.header}>
				<div className={styles.brand}>
					<span className={styles.logo}>CT</span>
					<Subtitle2>Contract Tester</Subtitle2>
				</div>
				<div className={styles.actions}>
					<span className={styles.live}>
						{isConnected ? (
							<PlugConnectedRegular />
						) : (
							<PlugDisconnectedRegular />
						)}
						<Caption1>
							{isConnected
								? "Live telemetry attached"
								: "Disconnected — reconnecting"}
						</Caption1>
					</span>
					<GatewayStatus />
					<Tooltip
						content={`Theme: ${mode}`}
						relationship="label"
					>
						<Button
							appearance="subtle"
							icon={MODE_ICON[mode]}
							onClick={() =>
								setMode(
									NEXT_MODE[
										mode
									],
								)
							}
							aria-label="Toggle theme"
						/>
					</Tooltip>
					<Avatar
						name="Red Team"
						size={28}
						color="colorful"
					/>
				</div>
			</header>
			<div className={styles.shell}>
				<nav
					className={styles.sidebar}
					aria-label="Studio"
				>
					<Caption1 className={styles.section}>
						Studio
					</Caption1>
					<TabList
						vertical
						selectedValue={activeNav(
							pathname,
						)}
						onTabSelect={(_, d) =>
							navigate(
								String(d.value),
							)
						}
					>
						{NAV.map((item) => (
							<Tab
								key={item.value}
								value={
									item.value
								}
								icon={item.icon}
							>
								{item.label}
							</Tab>
						))}
					</TabList>
					<Divider />
				</nav>
				<motion.main
					key={activeNav(pathname)}
					className={styles.main}
					initial={
						reduceMotion
							? false
							: { opacity: 0, y: 12 }
					}
					animate={{ opacity: 1, y: 0 }}
					transition={{
						duration: reduceMotion
							? 0
							: 0.2,
						ease: [0.4, 0, 0.2, 1],
					}}
				>
					{children}
				</motion.main>
			</div>
		</div>
	);
}
