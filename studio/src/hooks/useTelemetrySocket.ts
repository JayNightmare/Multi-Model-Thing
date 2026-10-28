import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { TelemetryConnection } from "../api/types";
import { frameToEvent } from "../lib/events";
import type { FuzzerMode, TelemetryEvent, TraceRecord } from "../types";
import { useAsync, type AsyncStatus } from "./useAsync";

export interface TelemetryState {
	isConnected: boolean;
	isRunning: boolean;
	activeRunId: string | null;
	/** Traces of the active run, newest first. */
	traces: TraceRecord[];
	events: TelemetryEvent[];
	eventsStatus: AsyncStatus;
	eventsError: string | null;
	reloadEvents: () => void;
	/** Increments whenever a run completes so views can refetch persisted data. */
	completedRuns: number;
	lastError: string | null;
	triggerRun: (fuzzerMode: FuzzerMode, edgeId?: string) => void;
}

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10_000;

export function useTelemetrySocket(projectId: string): TelemetryState {
	const [isConnected, setConnected] = useState(false);
	const [isRunning, setRunning] = useState(false);
	const [activeRunId, setActiveRunId] = useState<string | null>(null);
	const [traces, setTraces] = useState<TraceRecord[]>([]);
	const [liveEvents, setLiveEvents] = useState<TelemetryEvent[]>([]);
	const [completedRuns, setCompletedRuns] = useState(0);
	const [lastError, setLastError] = useState<string | null>(null);
	const connectionRef = useRef<TelemetryConnection | null>(null);

	const history = useAsync(() => api.listRecentEvents(), []);

	useEffect(() => {
		let disposed = false;
		let backoff = INITIAL_BACKOFF_MS;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const connect = () => {
			const connection = api.openTelemetry({
				onOpen: () => {
					if (disposed) return;
					backoff = INITIAL_BACKOFF_MS;
					setConnected(true);
				},
				onClose: () => {
					if (disposed) return;
					setConnected(false);
					setRunning(false);
					backoff = Math.min(
						backoff * 1.5,
						MAX_BACKOFF_MS,
					);
					timer = setTimeout(connect, backoff);
				},
				onFrame: (frame) => {
					if (disposed) return;
					// Runs started from an assistant stream here too, so keep only the open project's.
					if (
						"projectId" in frame &&
						frame.projectId !== undefined &&
						frame.projectId !== projectId
					)
						return;
					const event = frameToEvent(frame);
					if (event)
						setLiveEvents((prev) => [
							...prev,
							event,
						]);

					if (frame.type === "RUN_STARTED") {
						setActiveRunId(frame.runId);
						setTraces([]);
						setRunning(true);
						setLastError(null);
					} else if (
						frame.type === "TRACE_EMITTED"
					) {
						setTraces((prev) => [
							frame.trace,
							...prev,
						]);
					} else if (
						frame.type === "RUN_COMPLETED"
					) {
						setRunning(false);
						setCompletedRuns((n) => n + 1);
					} else {
						setRunning(false);
						setLastError(
							frame.error.message,
						);
					}
				},
			});
			connectionRef.current = connection;
		};

		connect();
		return () => {
			disposed = true;
			if (timer) clearTimeout(timer);
			connectionRef.current?.close();
			connectionRef.current = null;
		};
	}, [projectId]);

	const triggerRun = useCallback(
		(fuzzerMode: FuzzerMode, edgeId?: string) => {
			const connection = connectionRef.current;
			if (!connection) return;
			setRunning(true);
			connection.send({
				type: "START_TEST_RUN",
				fuzzerMode,
				edgeId,
			});
		},
		[],
	);

	const events = useMemo(() => {
		const seen = new Set<string>();
		return [...(history.data ?? []), ...liveEvents].filter(
			(e) => !seen.has(e.id) && seen.add(e.id),
		);
	}, [history.data, liveEvents]);

	return {
		isConnected,
		isRunning,
		activeRunId,
		traces,
		events,
		eventsStatus: history.status,
		eventsError: history.error,
		reloadEvents: history.reload,
		completedRuns,
		lastError,
		triggerRun,
	};
}
