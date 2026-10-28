import {
	Avatar,
	Badge,
	Body1,
	Button,
	Caption1,
	Card,
	Field,
	Link as FluentLink,
	MessageBar,
	MessageBarBody,
	Radio,
	RadioGroup,
	Select,
	Subtitle1,
	Title2,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { SignOutRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listTokens, revokeToken } from "../api/client";
import { useAuth } from "../hooks/AuthContext";
import { useAsync } from "../hooks/useAsync";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { loadPrefs, savePrefs, type Prefs } from "../lib/prefs";
import { ROUTES } from "../lib/routes";
import { useThemeMode, type ThemeMode } from "../theme/theme";
import type { FuzzerMode } from "../types";

const useStyles = makeStyles({
	grid: {
		display: "grid",
		gap: "16px",
		gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
		alignItems: "start",
	},
	stack: { display: "flex", flexDirection: "column", gap: "12px" },
	profile: { display: "flex", alignItems: "center", gap: "16px" },
	rows: {
		display: "grid",
		gridTemplateColumns: "auto 1fr",
		gap: "6px 16px",
	},
	label: { color: tokens.colorNeutralForeground3 },
	muted: { color: tokens.colorNeutralForeground3 },
});

function useNow(intervalMs: number): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs]);
	return now;
}

function formatDateTime(iso: string | null): string {
	return iso ? new Date(iso).toLocaleString() : "—";
}

function formatRemaining(expiresAt: string | null, now: number): string {
	if (!expiresAt) return "—";
	const ms = new Date(expiresAt).getTime() - now;
	if (ms <= 0) return "expired";
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) return "less than a minute";
	return minutes >= 60
		? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
		: `${minutes} min`;
}

export default function Account() {
	const styles = useStyles();
	const navigate = useNavigate();
	const { user, signOut } = useAuth();
	const { mode, setMode } = useThemeMode();
	const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
	const now = useNow(30_000);
	const tokens = useAsync(() => listTokens(), []);
	useDocumentTitle("Account");

	if (!user) return null;

	const updatePrefs = (next: Prefs) => {
		setPrefs(next);
		savePrefs(next);
	};
	const handleSignOut = () => {
		navigate(ROUTES.home);
		signOut();
	};
	const displayName = user.name ?? user.login;

	return (
		<>
			<Title2 as="h1">Account</Title2>
			<div className={styles.grid}>
				<Card>
					<div className={styles.stack}>
						<Subtitle1 as="h2">
							Profile
						</Subtitle1>
						<div className={styles.profile}>
							<Avatar
								name={
									displayName
								}
								image={
									user.avatarUrl
										? {
												src: user.avatarUrl,
											}
										: undefined
								}
								size={56}
								color="colorful"
							/>
							<div>
								<Body1>
									<b>
										{
											displayName
										}
									</b>
								</Body1>
								<br />
								<Caption1
									className={
										styles.muted
									}
								>
									@
									{
										user.login
									}
								</Caption1>
							</div>
						</div>
						<div className={styles.rows}>
							<Caption1
								className={
									styles.label
								}
							>
								Sign-in method
							</Caption1>
							<span>
								<Badge
									appearance="tint"
									color="informative"
								>
									{user.method ===
									"github"
										? "GitHub"
										: user.method ===
											  "password"
											? "Shared password"
											: "Authentication off"}
								</Badge>
							</span>
						</div>
						{user.method === "github" ? (
							<FluentLink
								href={`https://github.com/${encodeURIComponent(user.login)}`}
								target="_blank"
								rel="noopener noreferrer"
							>
								View GitHub
								profile
							</FluentLink>
						) : null}
					</div>
				</Card>

				<Card>
					<div className={styles.stack}>
						<Subtitle1 as="h2">
							Session
						</Subtitle1>
						{user.method === "none" ? (
							<MessageBar>
								<MessageBarBody>
									This
									gateway
									runs
									without
									authentication,
									so there
									is no
									session
									to
									manage.
								</MessageBarBody>
							</MessageBar>
						) : (
							<>
								<div
									className={
										styles.rows
									}
								>
									<Caption1
										className={
											styles.label
										}
									>
										Signed
										in
									</Caption1>
									<Body1>
										{formatDateTime(
											user.issuedAt,
										)}
									</Body1>
									<Caption1
										className={
											styles.label
										}
									>
										Expires
									</Caption1>
									<Body1>
										{formatDateTime(
											user.expiresAt,
										)}{" "}
										(in{" "}
										{formatRemaining(
											user.expiresAt,
											now,
										)}

										)
									</Body1>
								</div>
								<Caption1
									className={
										styles.muted
									}
								>
									Signing
									out
									removes
									the
									session
									from
									this
									browser.
									The
									token
									itself
									cannot
									be
									revoked
									and
									simply
									expires
									at the
									time
									above.
								</Caption1>
								<span>
									<Button
										icon={
											<SignOutRegular />
										}
										onClick={
											handleSignOut
										}
									>
										Sign
										out
									</Button>
								</span>
							</>
						)}
					</div>
				</Card>

				<Card>
					<div className={styles.stack}>
						<Subtitle1 as="h2">
							Preferences
						</Subtitle1>
						<Field label="Theme">
							<Select
								value={mode}
								onChange={(
									_,
									d,
								) =>
									setMode(
										d.value as ThemeMode,
									)
								}
							>
								<option value="system">
									Match
									system
								</option>
								<option value="dark">
									Dark
								</option>
								<option value="light">
									Light
								</option>
							</Select>
						</Field>
						<Field label="Default fuzzer mode">
							<RadioGroup
								value={
									prefs.defaultFuzzerMode
								}
								onChange={(
									_,
									d,
								) =>
									updatePrefs(
										{
											...prefs,
											defaultFuzzerMode:
												d.value as FuzzerMode,
										},
									)
								}
							>
								<Radio
									value="semantic"
									label="Semantic (language-model driven)"
								/>
								<Radio
									value="heuristic"
									label="Heuristic (deterministic)"
								/>
							</RadioGroup>
						</Field>
						<Caption1
							className={styles.muted}
						>
							Saved in this browser.
						</Caption1>
					</div>
				</Card>

				<Card>
					<div className={styles.stack}>
						<Subtitle1 as="h2">
							Connected tools
						</Subtitle1>
						{tokens.status === "error" ? (
							<Caption1
								className={
									styles.muted
								}
							>
								Connected tools
								are not
								available on
								this gateway.
							</Caption1>
						) : (tokens.data ?? [])
								.length ===
						  0 ? (
							<Body1
								className={
									styles.muted
								}
							>
								No tools are
								connected. See{" "}
								<Link
									to={
										ROUTES.connectGuide
									}
								>
									Connect
									agents
								</Link>{" "}
								to add one.
							</Body1>
						) : (
							(tokens.data ?? []).map(
								(t) => (
									<div
										key={
											t.tokenId
										}
										className={
											styles.stack
										}
									>
										<Body1>
											<b>
												{
													t.clientName
												}
											</b>
										</Body1>
										<Caption1
											className={
												styles.muted
											}
										>
											Connected{" "}
											{formatDateTime(
												t.createdAt,
											)}{" "}
											·
											last
											used{" "}
											{t.lastUsedAt
												? formatDateTime(
														t.lastUsedAt,
													)
												: "never"}{" "}
											·
											expires{" "}
											{formatDateTime(
												t.expiresAt,
											)}
										</Caption1>
										<span>
											<Button
												size="small"
												onClick={() =>
													void revokeToken(
														t.tokenId,
													).then(
														tokens.reload,
													)
												}
											>
												Revoke
											</Button>
										</span>
									</div>
								),
							)
						)}
					</div>
				</Card>

				<Card>
					<div className={styles.stack}>
						<Subtitle1 as="h2">
							Legal
						</Subtitle1>
						{user.terms ? (
							<Body1>
								You accepted
								version{" "}
								<b>
									{
										user
											.terms
											.version
									}
								</b>{" "}
								of the Terms and
								Privacy Policy
								on{" "}
								{formatDateTime(
									user
										.terms
										.acceptedAt,
								)}
								.
							</Body1>
						) : (
							<Body1
								className={
									styles.muted
								}
							>
								No acceptance is
								recorded for
								this sign-in
								method.
							</Body1>
						)}
						<div className={styles.stack}>
							<Link to={ROUTES.terms}>
								Terms of Service
							</Link>
							<Link
								to={
									ROUTES.privacy
								}
							>
								Privacy Policy
							</Link>
						</div>
					</div>
				</Card>
			</div>
		</>
	);
}
