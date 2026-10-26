import {
	Button,
	Card,
	Field,
	Input,
	MessageBar,
	MessageBarBody,
	Title3,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import {
	useCallback,
	useEffect,
	useState,
	type FormEvent,
	type ReactNode,
} from "react";
import { AUTH_EXPIRED_EVENT, getToken, setToken } from "../api/auth";
import { fetchAuthRequired, login } from "../api/client";
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

export function AuthGate({ children }: { children: ReactNode }) {
	const styles = useStyles();
	const [state, setState] = useState<GateState>({ status: "checking" });
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const check = useCallback(() => {
		setState({ status: "checking" });
		fetchAuthRequired()
			.then((required) =>
				setState({
					status:
						!required || getToken()
							? "open"
							: "login",
				}),
			)
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
					<form
						className={styles.card}
						onSubmit={submit}
					>
						<Title3>Sign in</Title3>
						{error ? (
							<MessageBar intent="error">
								<MessageBarBody>
									{error}
								</MessageBarBody>
							</MessageBar>
						) : null}
						<Field label="Password">
							<Input
								type="password"
								autoComplete="current-password"
								value={password}
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
							appearance="primary"
							disabled={
								busy ||
								password === ""
							}
						>
							Sign in
						</Button>
					</form>
				</Card>
			)}
		</div>
	);
}
