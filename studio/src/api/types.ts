import type {
	GatewayHealth,
	IngestTraceRequest,
	IngestTraceResponse,
	RunSummary,
	StartTestRun,
	TelemetryEvent,
	TelemetryFrame,
	Topology,
	TraceRecord,
} from "../types";

export interface TelemetryHandlers {
	onOpen: () => void;
	onClose: () => void;
	onFrame: (frame: TelemetryFrame) => void;
}

export interface TelemetryConnection {
	send: (action: StartTestRun) => void;
	close: () => void;
}

export interface TraceQuery {
	runId?: string;
	edgeId?: string;
}

export interface ApiClient {
	getHealth(): Promise<GatewayHealth>;
	/** Agent and edge reference data (no gateway route). */
	getTopology(): Promise<Topology>;
	listRuns(): Promise<RunSummary[]>;
	listTraces(query?: TraceQuery): Promise<TraceRecord[]>;
	/** Backlog shown in the Event Log before live frames arrive. */
	listRecentEvents(): Promise<TelemetryEvent[]>;
	ingestTrace(input: IngestTraceRequest): Promise<IngestTraceResponse>;
	openTelemetry(handlers: TelemetryHandlers): TelemetryConnection;
}
