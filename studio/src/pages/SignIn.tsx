import {
	Body1,
	Button,
	Caption1,
	Card,
	Checkbox,
	Divider,
	Field,
	Input,
	MessageBar,
	MessageBarBody,
	Title2,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { PersonRegular } from "@fluentui/react-icons";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { exchangeLoginCode, githubLoginUrl, login } from "../api/client";
import { ErrorState, LoadingState } from "../components/StateViews";
import { useAuth } from "../hooks/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { ROUTES, safeNext } from "../lib/routes";

const NEXT_KEY = "signin.next";

const LOGIN_ERRORS: Record<string, string> = {
	state: "The sign-in attempt could not be verified. Try again.",
	denied: "GitHub sign-in was cancelled.",
	github: "GitHub could not complete the sign-in. Try again.",
	not_allowed: "That GitHub account is not allowed to use this studio.",
	terms: "You need to accept the Terms and Privacy Policy to sign in.",
	server: "Something went wrong on our side. Try again in a moment.",
};

// One exchange per code, so React StrictMode's double effect cannot spend the one-time code twice.
const exchanges = new Map<string, Promise<string>>();

const useStyles = makeStyles({
	page: {
		display: "grid",
		placeItems: "center",
		padding: "48px 0",
	},
	card: { width: "100%", maxWidth: "420px" },
	stack: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalM,
	},
	muted: { color: tokens.colorNeutralForeground3 },
});

export default function SignIn() {
	const styles = useStyles();
	const navigate = useNavigate();
	const auth = useAuth();
	const [params, setParams] = useSearchParams();
	useDocumentTitle("Sign in");

	const loginCode = params.get("login_code");
	const loginError = params.get("login_error");
	const next = safeNext(
		params.get("next") ?? sessionStorage.getItem(NEXT_KEY),
	);

	const [error, setError] = useState<string | null>(
		loginError
			? (LOGIN_ERRORS[loginError] ?? "Sign in failed.")
			: null,
	);
	const [exchanging, setExchanging] = useState(Boolean(loginCode));
	const [accepted, setAccepted] = useState(false);
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (!loginError) return;
		setParams({}, { replace: true });
	}, [loginError, setParams]);

	useEffect(() => {
		if (!loginCode) return;
		let exchange = exchanges.get(loginCode);
		if (!exchange) {
			exchange = exchangeLoginCode(loginCode);
			exchanges.set(loginCode, exchange);
		}
		exchange.then((token) => auth.completeSignIn(token))
			.then(() => {
				sessionStorage.removeItem(NEXT_KEY);
				navigate(next, { replace: true });
			})
			.catch(() => {
				setError("Sign-in expired. Try again.");
				setExchanging(false);
				setParams({}, { replace: true });
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loginCode]);

	if (auth.status === "loading" || exchanging)
		return <LoadingState rows={3} label="Signing you in" />;
	if (auth.status === "error")
		return (
			<ErrorState
				message={auth.error ?? "Gateway is unreachable"}
				onRetry={auth.reload}
			/>
		);
	if (!auth.required || auth.user) return <Navigate to={next} replace />;

	const startGithub = () => {
		sessionStorage.setItem(NEXT_KEY, next);
		window.location.assign(githubLoginUrl(auth.legalVersion));
	};

	const submitPassword = async (event: FormEvent) => {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			await auth.completeSignIn(await login(password));
			setPassword("");
			navigate(next, { replace: true });
		} catch (e) {
			setError(
				e instanceof Error
					? e.message
					: "Sign in failed",
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className={styles.page}>
			<Card className={styles.card}>
				<div className={styles.stack}>
					<Title2 as="h1">Sign in</Title2>
					<Body1 className={styles.muted}>
						Access to the studio is limited
						to approved GitHub accounts.
					</Body1>
					{error ? (
						<MessageBar intent="error">
							<MessageBarBody>
								{error}
							</MessageBarBody>
						</MessageBar>
					) : null}
					<Checkbox
						checked={accepted}
						onChange={(_, d) =>
							setAccepted(
								d.checked ===
									true,
							)
						}
						label={
							<>
								I agree to the{" "}
								<Link
									to={
										ROUTES.terms
									}
									target="_blank"
								>
									Terms of
									Service
								</Link>{" "}
								and{" "}
								<Link
									to={
										ROUTES.privacy
									}
									target="_blank"
								>
									Privacy
									Policy
								</Link>
							</>
						}
					/>
					{auth.methods.github ? (
						<Button
							appearance="primary"
							icon={<PersonRegular />}
							disabled={!accepted}
							onClick={startGithub}
						>
							Continue with GitHub
						</Button>
					) : null}
					{auth.methods.github &&
					auth.methods.password ? (
						<Divider>or</Divider>
					) : null}
					{auth.methods.password ? (
						<form
							className={styles.stack}
							onSubmit={
								submitPassword
							}
						>
							<Field label="Password">
								<Input
									type="password"
									autoComplete="current-password"
									value={
										password
									}
									onChange={(
										_,
										d,
									) =>
										setPassword(
											d.value,
										)
									}
								/>
							</Field>
							<Button
								type="submit"
								appearance={
									auth
										.methods
										.github
										? "secondary"
										: "primary"
								}
								disabled={
									busy ||
									!accepted ||
									password ===
										""
								}
							>
								Sign in
							</Button>
						</form>
					) : null}
					{auth.methods.github ? (
						<Caption1
							className={styles.muted}
						>
							We only read your public
							GitHub profile (login,
							name and avatar).
						</Caption1>
					) : null}
				</div>
			</Card>
		</div>
	);
}
