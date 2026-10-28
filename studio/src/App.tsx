import { FluentProvider } from "@fluentui/react-components";
import { lazy, Suspense } from "react";
import {
	BrowserRouter,
	Navigate,
	Outlet,
	Route,
	Routes,
	useParams,
} from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { PublicShell } from "./components/PublicShell";
import { RequireAuth } from "./components/RequireAuth";
import { LoadingState } from "./components/StateViews";
import { AuthProvider } from "./hooks/AuthContext";
import { TelemetryProvider } from "./hooks/TelemetryContext";
import { ROUTES } from "./lib/routes";
import { ThemeModeProvider } from "./theme/theme";

const Landing = lazy(() => import("./pages/Landing"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const SignIn = lazy(() => import("./pages/SignIn"));
const Terms = lazy(() =>
	import("./pages/Legal").then((m) => ({ default: m.Terms })),
);
const Privacy = lazy(() =>
	import("./pages/Legal").then((m) => ({ default: m.Privacy })),
);
const Account = lazy(() => import("./pages/Account"));
const ContractCanvas = lazy(() => import("./pages/ContractCanvas"));
const PayloadDiff = lazy(() => import("./pages/PayloadDiff"));
const PayloadDiffIndex = lazy(() =>
	import("./pages/PayloadDiff").then((m) => ({
		default: m.PayloadDiffIndex,
	})),
);
const EventLog = lazy(() => import("./pages/EventLog"));
const ReportExport = lazy(() => import("./pages/ReportExport"));

// Telemetry (and its WebSocket) only exists for signed-in app pages.
function AppLayout() {
	return (
		<TelemetryProvider>
			<AppShell>
				<Suspense fallback={<LoadingState rows={6} />}>
					<Outlet />
				</Suspense>
			</AppShell>
		</TelemetryProvider>
	);
}

function LegacyEdge() {
	const { edgeId } = useParams();
	return <Navigate to={ROUTES.edge(edgeId ?? "")} replace />;
}

export default function App() {
	return (
		<ThemeModeProvider>
			{(theme, resolved) => (
				<FluentProvider
					theme={theme}
					style={{
						minHeight: "100%",
						colorScheme: resolved,
					}}
				>
					<BrowserRouter>
						<AuthProvider>
							<Suspense
								fallback={
									<LoadingState
										rows={
											6
										}
									/>
								}
							>
								<Routes>
									<Route
										element={
											<PublicShell />
										}
									>
										<Route
											path={
												ROUTES.home
											}
											element={
												<Landing />
											}
										/>
										<Route
											path={
												ROUTES.how
											}
											element={
												<HowItWorks />
											}
										/>
										<Route
											path={
												ROUTES.terms
											}
											element={
												<Terms />
											}
										/>
										<Route
											path={
												ROUTES.privacy
											}
											element={
												<Privacy />
											}
										/>
										<Route
											path={
												ROUTES.signIn
											}
											element={
												<SignIn />
											}
										/>
									</Route>
									<Route
										element={
											<RequireAuth />
										}
									>
										<Route
											path={
												ROUTES.app
											}
											element={
												<AppLayout />
											}
										>
											<Route
												index
												element={
													<ContractCanvas />
												}
											/>
											<Route
												path="edges"
												element={
													<PayloadDiffIndex />
												}
											/>
											<Route
												path="edges/:edgeId"
												element={
													<PayloadDiff />
												}
											/>
											<Route
												path="events"
												element={
													<EventLog />
												}
											/>
											<Route
												path="report"
												element={
													<ReportExport />
												}
											/>
											<Route
												path="account"
												element={
													<Account />
												}
											/>
										</Route>
									</Route>
									<Route
										path="/edges"
										element={
											<Navigate
												to={
													ROUTES.edges
												}
												replace
											/>
										}
									/>
									<Route
										path="/edges/:edgeId"
										element={
											<LegacyEdge />
										}
									/>
									<Route
										path="/events"
										element={
											<Navigate
												to={
													ROUTES.events
												}
												replace
											/>
										}
									/>
									<Route
										path="/report"
										element={
											<Navigate
												to={
													ROUTES.report
												}
												replace
											/>
										}
									/>
									<Route
										path="*"
										element={
											<Navigate
												to={
													ROUTES.home
												}
												replace
											/>
										}
									/>
								</Routes>
							</Suspense>
						</AuthProvider>
					</BrowserRouter>
				</FluentProvider>
			)}
		</ThemeModeProvider>
	);
}
