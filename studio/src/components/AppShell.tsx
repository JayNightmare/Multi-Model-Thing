import {
	Avatar,
	Badge,
	Button,
	Caption1,
	Divider,
	Menu,
	MenuDivider,
	MenuItem,
	MenuList,
	MenuPopover,
	MenuTrigger,
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
	DocumentRegular,
	GridRegular,
	PersonRegular,
	PlugConnectedRegular,
	PlugDisconnectedRegular,
	ShieldRegular,
	SignOutRegular,
	TextBulletListLtrRegular,
} from "@fluentui/react-icons";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../hooks/AuthContext";
import { useTelemetry } from "../hooks/TelemetryContext";
import { useAsync } from "../hooks/useAsync";
import { ROUTES } from "../lib/routes";
import { ThemeToggle } from "./ThemeToggle";

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
		color: "inherit",
		textDecoration: "none",
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
	{ value: ROUTES.app, label: "Contract Canvas", icon: <GridRegular /> },
	{
		value: ROUTES.edges,
		label: "Payload Diff",
		icon: <ArrowSwapRegular />,
	},
	{
		value: ROUTES.events,
		label: "Event Log",
		icon: <TextBulletListLtrRegular />,
	},
	{
		value: ROUTES.report,
		label: "Report Export",
		icon: <ArrowDownloadRegular />,
	},
];

// Empty on pages without a tab (the account page) so no tab appears selected.
function activeNav(pathname: string): string {
	if (pathname.startsWith(ROUTES.edges)) return ROUTES.edges;
	if (pathname.startsWith(ROUTES.events)) return ROUTES.events;
	if (pathname.startsWith(ROUTES.report)) return ROUTES.report;
	if (pathname.startsWith(ROUTES.account)) return "";
	return ROUTES.app;
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
	const { user, required, signOut } = useAuth();
	const reduceMotion = useReducedMotion();

	return (
		<div className={styles.root}>
			<header className={styles.header}>
				<Link to={ROUTES.app} className={styles.brand}>
					<span
						className={styles.logo}
						aria-hidden="true"
					>
						CT
					</span>
					<Subtitle2>Contract Tester</Subtitle2>
				</Link>
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
					<ThemeToggle />
					{user ? (
						<Menu>
							<MenuTrigger
								disableButtonEnhancement
							>
								<Button
									appearance="subtle"
									aria-label="Account menu"
									icon={
										<Avatar
											name={
												user.name ??
												user.login
											}
											image={
												user.avatarUrl
													? {
															src: user.avatarUrl,
														}
													: undefined
											}
											size={
												28
											}
											color="colorful"
										/>
									}
								/>
							</MenuTrigger>
							<MenuPopover>
								<MenuList>
									<MenuItem
										icon={
											<PersonRegular />
										}
										onClick={() =>
											navigate(
												ROUTES.account,
											)
										}
									>
										Account
									</MenuItem>
									<MenuItem
										icon={
											<DocumentRegular />
										}
										onClick={() =>
											navigate(
												ROUTES.terms,
											)
										}
									>
										Terms
									</MenuItem>
									<MenuItem
										icon={
											<ShieldRegular />
										}
										onClick={() =>
											navigate(
												ROUTES.privacy,
											)
										}
									>
										Privacy
									</MenuItem>
									{required ? (
										<>
											<MenuDivider />
											<MenuItem
												icon={
													<SignOutRegular />
												}
												onClick={() => {
													navigate(
														ROUTES.home,
													);
													signOut();
												}}
											>
												Sign
												out
											</MenuItem>
										</>
									) : null}
								</MenuList>
							</MenuPopover>
						</Menu>
					) : null}
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
