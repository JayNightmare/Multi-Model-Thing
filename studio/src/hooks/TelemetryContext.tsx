import { createContext, useContext, type ReactNode } from "react";
import { useTelemetrySocket, type TelemetryState } from "./useTelemetrySocket";

const TelemetryContext = createContext<TelemetryState | null>(null);

export function TelemetryProvider({
	projectId,
	children,
}: {
	projectId: string;
	children: ReactNode;
}) {
	const state = useTelemetrySocket(projectId);
	return (
		<TelemetryContext.Provider value={state}>
			{children}
		</TelemetryContext.Provider>
	);
}

export function useTelemetry(): TelemetryState {
	const ctx = useContext(TelemetryContext);
	if (!ctx)
		throw new Error(
			"useTelemetry must be used inside TelemetryProvider",
		);
	return ctx;
}
