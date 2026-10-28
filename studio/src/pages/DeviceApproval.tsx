import {
	Body1,
	Button,
	Caption1,
	Card,
	MessageBar,
	MessageBarBody,
	Title2,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { decideDeviceCode, lookupDeviceCode } from "../api/client";
import { LoadingState } from "../components/StateViews";
import { useAuth } from "../hooks/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { ROUTES } from "../lib/routes";

const useStyles = makeStyles({
	page: { display: "grid", placeItems: "center", padding: "48px 0" },
	card: { width: "100%", maxWidth: "460px" },
	stack: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalM,
	},
	code: {
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeHero700,
		letterSpacing: "0.12em",
		textAlign: "center",
	},
	actions: { display: "flex", gap: "8px" },
	muted: { color: tokens.colorNeutralForeground3 },
});

type View =
	| { state: "loading" }
	| { state: "missing" }
	| { state: "ready"; clientName: string; userCode: string }
	| { state: "done"; approved: boolean };

/** Where a signed-in user approves (or denies) a sign-in request started by an MCP client. */
export default function DeviceApproval() {
	const styles = useStyles();
	const { user } = useAuth();
	const [params] = useSearchParams();
	const code = params.get("code") ?? "";
	const [view, setView] = useState<View>({ state: "loading" });
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	useDocumentTitle("Connect a tool");

	useEffect(() => {
		if (!code) {
			setView({ state: "missing" });
			return;
		}
		lookupDeviceCode(code)
			.then((found) => setView({ state: "ready", ...found }))
			.catch(() => setView({ state: "missing" }));
	}, [code]);

	const decide = async (approve: boolean) => {
		setBusy(true);
		setError(null);
		try {
			await decideDeviceCode(code, approve);
			setView({ state: "done", approved: approve });
		} catch (e) {
			setError(
				e instanceof Error
					? e.message
					: "Something went wrong",
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className={styles.page}>
			<Card className={styles.card}>
				<div className={styles.stack}>
					<Title2 as="h1">Connect a tool</Title2>
					{view.state === "loading" ? (
						<LoadingState
							rows={2}
							label="Looking up the request"
						/>
					) : view.state === "missing" ? (
						<>
							<MessageBar intent="warning">
								<MessageBarBody>
									That
									code was
									not
									found or
									has
									expired.
									Start
									the
									sign-in
									again
									from
									your
									editor
									(ask the
									assistant
									to run{" "}
									<b>
										mml_login
									</b>
									).
								</MessageBarBody>
							</MessageBar>
							<Link
								to={
									ROUTES.connectGuide
								}
							>
								How to connect
								your agents
							</Link>
						</>
					) : view.state === "done" ? (
						<>
							<MessageBar
								intent={
									view.approved
										? "success"
										: "info"
								}
							>
								<MessageBarBody>
									{view.approved
										? "Approved. You can go back to your editor; it will finish signing in on its own."
										: "Denied. The tool was not given access."}
								</MessageBarBody>
							</MessageBar>
							<Link
								to={
									ROUTES.account
								}
							>
								Manage connected
								tools
							</Link>
						</>
					) : (
						<>
							<Body1>
								<b>
									{
										view.clientName
									}
								</b>{" "}
								wants to use
								Contract Tester
								as{" "}
								<b>
									@
									{
										user?.login
									}
								</b>
								.
							</Body1>
							<div
								className={
									styles.code
								}
								aria-label="Code to compare"
							>
								{view.userCode}
							</div>
							<Caption1
								className={
									styles.muted
								}
							>
								Only approve
								this if the same
								code is shown in
								your editor. It
								lets the tool
								create projects,
								define
								contracts, start
								runs and read
								results in your
								account. It
								cannot manage
								tokens, and you
								can revoke it
								any time on your
								account page.
							</Caption1>
							{error ? (
								<MessageBar intent="error">
									<MessageBarBody>
										{
											error
										}
									</MessageBarBody>
								</MessageBar>
							) : null}
							<div
								className={
									styles.actions
								}
							>
								<Button
									appearance="primary"
									disabled={
										busy
									}
									onClick={() =>
										void decide(
											true,
										)
									}
								>
									Approve
								</Button>
								<Button
									disabled={
										busy
									}
									onClick={() =>
										void decide(
											false,
										)
									}
								>
									Deny
								</Button>
							</div>
						</>
					)}
				</div>
			</Card>
		</div>
	);
}
