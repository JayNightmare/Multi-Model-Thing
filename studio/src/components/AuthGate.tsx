import {
	Button,
	Card,
	Divider,
	Field,
	Input,
	MessageBar,
	MessageBarBody,
	Title3,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { PersonRegular } from "@fluentui/react-icons";
import {
	useCallback,
	useEffect,
	useState,
	type FormEvent,
	type ReactNode,
} from "react";
import { AUTH_EXPIRED_EVENT, getToken, setToken } from "../api/auth";
import {
	exchangeLoginCode,
	fetchAuthStatus,
	githubLoginUrl,
	login,
	type AuthStatus,
} from "../api/client";
import { ErrorState, LoadingState } from "./StateViews";

const useStyles = makeStyles({
	center: {
		minHeight: "100vh",
		display: "grid",
		placeItems: "center",
		padding: "24px",
	},
	card: {
		width: "100%",
		maxWidth: "360px",
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalM,
	},
});

type GateState =
	| { status: "checking" }
	| { status: "error"; message: string }
	| { status: "login" }
	| { status: "open" };

const LOGIN_ERRORS: Record<string, string> = {
	state: "The sign-in attempt could not be verified. Try again.",
	denied: "GitHub sign-in was cancelled.",
	github: "GitHub could not complete the sign-in. Try again.",
	not_allowed: "That GitHub account is not allowed to use this studio.",
};

// Handled once per page load so React StrictMode's double effect cannot spend the one-time code twice.
let redirectResult: Promise<string | null> | null = null;

function handleGithubRedirect(): Promise<string | null> {
	redirectResult ??= (async () => {
		const params = new URLSearchParams(window.location.search);
		const code = params.get("login_code");
		const loginError = params.get("login_error");
		if (!code && !loginError) return null;
		window.history.replaceState(
			null,
			"",
			window.location.pathname + window.location.hash,
		);
		if (loginError) {
			return LOGIN_ERRORS[loginError] ?? "Sign in failed.";
		}
		try {
			setToken(await exchangeLoginCode(code!));
			return null;
		} catch {
			return "Sign-in expired. Try again.";
		}
	})();
	return redirectResult;
}

export function AuthGate({ children }: { children: ReactNode }) {
	const styles = useStyles();
	const [state, setState] = useState<GateState>({ status: "checking" });
	const [methods, setMethods] = useState<AuthStatus["methods"]>({
		github: false,
		password: true,
	});
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const check = useCallback(() => {
		setState({ status: "checking" });
		handleGithubRedirect()
			.then(async (redirectError) => {
				if (redirectError) setError(redirectError);
				const status = await fetchAuthStatus();
				setMethods(status.methods);
				setState({
					status:
						!status.required || getToken()
							? "open"
							: "login",
				});
			})
			.catch((e: unknown) =>
				setState({
					status: "error",
					message:
						e instanceof Error
							? e.message
							: "Gateway is unreachable",
				}),
			);
	}, []);

	useEffect(check, [check]);

	useEffect(() => {
		const onExpired = () => {
			setError("Session expired. Sign in again.");
			setState({ status: "login" });
		};
		window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
		return () =>
			window.removeEventListener(
				AUTH_EXPIRED_EVENT,
				onExpired,
			);
	}, []);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			setToken(await login(password));
			setPassword("");
			setState({ status: "open" });
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

	if (state.status === "open") return <>{children}</>;

	return (
		<div className={styles.center}>
			{state.status === "checking" ? (
				<LoadingState
					rows={2}
					label="Connecting to gateway"
				/>
			) : state.status === "error" ? (
				<ErrorState
					message={state.message}
					onRetry={check}
				/>
			) : (
				<Card>
					<div className={styles.card}>
						<Title3>Sign in</Title3>
						{error ? (
							<MessageBar intent="error">
								<MessageBarBody>
									{error}
								</MessageBarBody>
							</MessageBar>
						) : null}
						{methods.github ? (
							<Button
								appearance="primary"
								icon={
									<PersonRegular />
								}
								onClick={() =>
									window.location.assign(
										githubLoginUrl(),
									)
								}
							>
								Sign in with
								GitHub
							</Button>
						) : null}
						{methods.github &&
						methods.password ? (
							<Divider>or</Divider>
						) : null}
						{methods.password ? (
							<form
								className={
									styles.card
								}
								onSubmit={
									submit
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
											data,
										) =>
											setPassword(
												data.value,
											)
										}
									/>
								</Field>
								<Button
									type="submit"
									appearance={
										methods.github
											? "secondary"
											: "primary"
									}
									disabled={
										busy ||
										password ===
											""
									}
								>
									Sign in
								</Button>
							</form>
						) : null}
					</div>
				</Card>
			)}
		</div>
	);
}
