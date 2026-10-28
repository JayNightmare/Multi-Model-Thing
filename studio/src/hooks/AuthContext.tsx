import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import {
	AUTH_EXPIRED_EVENT,
	clearToken,
	getToken,
	setToken,
} from "../api/auth";
import {
	fetchAuthStatus,
	fetchMe,
	type AuthStatus,
	type UserProfile,
} from "../api/client";

interface AuthState {
	status: "loading" | "error" | "ready";
	error: string | null;
	/** False when the gateway runs without authentication (local development). */
	required: boolean;
	methods: AuthStatus["methods"];
	legalVersion: string;
	user: UserProfile | null;
	reload: () => void;
	completeSignIn: (token: string) => Promise<void>;
	signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<AuthState["status"]>("loading");
	const [error, setError] = useState<string | null>(null);
	const [authStatus, setAuthStatus] = useState<AuthStatus>({
		required: true,
		legalVersion: "1",
		methods: { github: false, password: true },
	});
	const [user, setUser] = useState<UserProfile | null>(null);

	const load = useCallback(() => {
		setStatus("loading");
		setError(null);
		void (async () => {
			try {
				const s = await fetchAuthStatus();
				setAuthStatus({
					required: s.required,
					// Gateways from before GitHub sign-in omit these fields.
					legalVersion: s.legalVersion ?? "1",
					methods: s.methods ?? {
						github: false,
						password: true,
					},
				});
				setUser(
					!s.required || getToken()
						? await fetchMe().catch(
								() => null,
							)
						: null,
				);
				setStatus("ready");
			} catch (e) {
				setError(
					e instanceof Error
						? e.message
						: "Gateway is unreachable",
				);
				setStatus("error");
			}
		})();
	}, []);

	useEffect(load, [load]);

	useEffect(() => {
		const onExpired = () => setUser(null);
		window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
		return () =>
			window.removeEventListener(
				AUTH_EXPIRED_EVENT,
				onExpired,
			);
	}, []);

	const completeSignIn = useCallback(async (token: string) => {
		setToken(token);
		setUser(await fetchMe());
	}, []);

	const signOut = useCallback(() => {
		clearToken();
		setUser(null);
	}, []);

	const value = useMemo<AuthState>(
		() => ({
			status,
			error,
			required: authStatus.required,
			methods: authStatus.methods,
			legalVersion: authStatus.legalVersion,
			user,
			reload: load,
			completeSignIn,
			signOut,
		}),
		[
			status,
			error,
			authStatus,
			user,
			load,
			completeSignIn,
			signOut,
		],
	);

	return (
		<AuthContext.Provider value={value}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth(): AuthState {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
	return ctx;
}
