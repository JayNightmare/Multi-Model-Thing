import { FluentProvider } from "@fluentui/react-components";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AuthGate } from "./components/AuthGate";
import { LoadingState } from "./components/StateViews";
import { TelemetryProvider } from "./hooks/TelemetryContext";
import { ThemeModeProvider } from "./theme/theme";

const ContractCanvas = lazy(() => import("./pages/ContractCanvas"));
const PayloadDiff = lazy(() => import("./pages/PayloadDiff"));
const PayloadDiffIndex = lazy(() =>
	import("./pages/PayloadDiff").then((m) => ({
		default: m.PayloadDiffIndex,
	})),
);
const EventLog = lazy(() => import("./pages/EventLog"));
const ReportExport = lazy(() => import("./pages/ReportExport"));

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
						<AuthGate>
							<TelemetryProvider>
								<AppShell>
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
												path="/"
												element={
													<ContractCanvas />
												}
											/>
											<Route
												path="/edges"
												element={
													<PayloadDiffIndex />
												}
											/>
											<Route
												path="/edges/:edgeId"
												element={
													<PayloadDiff />
												}
											/>
											<Route
												path="/events"
												element={
													<EventLog />
												}
											/>
											<Route
												path="/report"
												element={
													<ReportExport />
												}
											/>
										</Routes>
									</Suspense>
								</AppShell>
							</TelemetryProvider>
						</AuthGate>
					</BrowserRouter>
				</FluentProvider>
			)}
		</ThemeModeProvider>
	);
}
