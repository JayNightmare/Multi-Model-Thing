import {
	Avatar,
	Button,
	Caption1,
	Subtitle2,
	makeStyles,
	mergeClasses,
	tokens,
} from "@fluentui/react-components";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";
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
		backgroundColor: tokens.colorNeutralBackground3,
		borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
	},
	bar: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: "16px",
		flexWrap: "wrap",
		maxWidth: "1080px",
		margin: "0 auto",
		padding: "10px 24px",
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
	nav: { display: "flex", alignItems: "center", gap: "4px" },
	link: {
		padding: "6px 10px",
		borderRadius: tokens.borderRadiusMedium,
		color: tokens.colorNeutralForeground2,
		textDecoration: "none",
		":hover": {
			backgroundColor: tokens.colorSubtleBackgroundHover,
		},
	},
	active: {
		color: tokens.colorNeutralForeground1,
		fontWeight: 600,
	},
	actions: { display: "flex", alignItems: "center", gap: "8px" },
	main: {
		flex: 1,
		width: "100%",
		maxWidth: "1080px",
		margin: "0 auto",
		padding: "0 24px",
		boxSizing: "border-box",
	},
	footer: {
		borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
		backgroundColor: tokens.colorNeutralBackground2,
	},
	footerBar: {
		display: "flex",
		justifyContent: "space-between",
		gap: "16px",
		flexWrap: "wrap",
		maxWidth: "1080px",
		margin: "0 auto",
		padding: "16px 24px",
		boxSizing: "border-box",
		color: tokens.colorNeutralForeground3,
	},
	footerLinks: { display: "flex", gap: "16px" },
});

const NAV = [
	{ to: ROUTES.how, label: "How it works" },
	{ to: ROUTES.terms, label: "Terms" },
	{ to: ROUTES.privacy, label: "Privacy" },
];

export function PublicShell() {
	const styles = useStyles();
	const navigate = useNavigate();
	const { user, required, status } = useAuth();
	const signedIn = status === "ready" && (user !== null || !required);

	return (
		<div className={styles.root}>
			<header className={styles.header}>
				<div className={styles.bar}>
					<Link
						to={ROUTES.home}
						className={styles.brand}
					>
						<span
							className={styles.logo}
							aria-hidden="true"
						>
							CT
						</span>
						<Subtitle2>
							Contract Tester
						</Subtitle2>
					</Link>
					<nav
						className={styles.nav}
						aria-label="Site"
					>
						{NAV.map((item) => (
							<NavLink
								key={item.to}
								to={item.to}
								className={({
									isActive,
								}) =>
									mergeClasses(
										styles.link,
										isActive &&
											styles.active,
									)
								}
							>
								{item.label}
							</NavLink>
						))}
					</nav>
					<div className={styles.actions}>
						<ThemeToggle />
						{signedIn ? (
							<>
								{user ? (
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
									/>
								) : null}
								<Button
									appearance="primary"
									onClick={() =>
										navigate(
											ROUTES.app,
										)
									}
								>
									Open app
								</Button>
							</>
						) : (
							<Button
								appearance="primary"
								onClick={() =>
									navigate(
										ROUTES.signIn,
									)
								}
							>
								Sign in
							</Button>
						)}
					</div>
				</div>
			</header>
			<main className={styles.main}>
				<Outlet />
			</main>
			<footer className={styles.footer}>
				<div className={styles.footerBar}>
					<Caption1>
						© {new Date().getFullYear()}{" "}
						Contract Tester
					</Caption1>
					<span className={styles.footerLinks}>
						<Link to={ROUTES.how}>
							How it works
						</Link>
						<Link to={ROUTES.terms}>
							Terms
						</Link>
						<Link to={ROUTES.privacy}>
							Privacy
						</Link>
					</span>
				</div>
			</footer>
		</div>
	);
}
