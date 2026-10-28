import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/AuthContext";
import { ROUTES } from "../lib/routes";
import { ErrorState, LoadingState } from "./StateViews";

export function RequireAuth() {
	const auth = useAuth();
	const location = useLocation();

	if (auth.status === "loading")
		return <LoadingState rows={3} label="Checking your session" />;
	if (auth.status === "error")
		return (
			<ErrorState
				message={auth.error ?? "Gateway is unreachable"}
				onRetry={auth.reload}
			/>
		);
	if (auth.required && !auth.user) {
		const next = encodeURIComponent(
			location.pathname + location.search,
		);
		return (
			<Navigate
				to={`${ROUTES.signIn}?next=${next}`}
				replace
			/>
		);
	}
	return <Outlet />;
}
