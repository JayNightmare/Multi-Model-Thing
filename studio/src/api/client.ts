import { frameToEvent } from "../lib/events";
import { AGENTS, EDGES } from "../lib/topology";
import { getToken, notifyAuthExpired } from "./auth";
import type {
	GatewayHealth,
	IngestTraceResponse,
	RunSummary,
	TelemetryEvent,
	TelemetryFrame,
	Topology,
	TraceRecord,
} from "../types";
import type {
	ApiClient,
	TelemetryConnection,
	TelemetryHandlers,
	TraceQuery,
} from "./types";

// Empty means same-origin: the Vite dev server proxies /health and /v1 to the gateway.
const BASE = (import.meta.env.VITE_GATEWAY_URL ?? "").replace(/\/+$/, "");

class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

async function errorMessage(res: Response): Promise<string> {
	const body = (await res.json().catch(() => null)) as {
		error?: { message?: string };
	} | null;
	return body?.error?.message ?? res.statusText;
}

async function request<T>(
	path: string,
	init?: RequestInit,
	okStatuses: readonly number[] = [],
): Promise<T> {
	let res: Response;
	const token = getToken();
	try {
		res = await fetch(`${BASE}${path}`, {
			...init,
			headers: {
				"Content-Type": "application/json",
				...(token
					? { Authorization: `Bearer ${token}` }
					: {}),
				...init?.headers,
			},
		});
	} catch {
		throw new Error("Gateway is unreachable");
	}
	if (res.status === 401 && token) notifyAuthExpired();
	if (!res.ok && !okStatuses.includes(res.status)) {
		throw new ApiError(res.status, await errorMessage(res));
	}
	return (await res.json()) as T;
}

function query(params: Record<string, string | undefined>): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value) search.set(key, value);
	}
	const text = search.toString();
	return text ? `?${text}` : "";
}

function telemetryUrl(): string {
	const origin = BASE || window.location.origin;
	return `${origin.replace(/^http/, "ws")}/v1/telemetry`;
}

export interface AuthStatus {
	required: boolean;
	methods: { github: boolean; password: boolean };
}

export function fetchAuthStatus(): Promise<AuthStatus> {
	return request<AuthStatus>("/v1/auth/status");
}

// A full-page navigation: GitHub redirects back through the gateway to the studio.
export function githubLoginUrl(): string {
	return `${BASE}/v1/auth/github/login`;
}

export async function exchangeLoginCode(code: string): Promise<string> {
	const res = await request<{ token: string }>("/v1/auth/exchange", {
		method: "POST",
		body: JSON.stringify({ code }),
	});
	return res.token;
}

export async function login(password: string): Promise<string> {
	const res = await request<{ token: string }>("/v1/auth/login", {
		method: "POST",
		body: JSON.stringify({ password }),
	});
	return res.token;
}

async function listRuns(): Promise<RunSummary[]> {
	const { runs } = await request<{ runs: RunSummary[] }>("/v1/runs");
	return runs;
}

async function listTraces(q: TraceQuery = {}): Promise<TraceRecord[]> {
	const { traces } = await request<{ traces: TraceRecord[] }>(
		`/v1/traces${query({ runId: q.runId, edgeId: q.edgeId })}`,
	);
	return traces;
}

export const liveClient: ApiClient = {
	// 503 (unhealthy) still carries the health body.
	getHealth: () => request<GatewayHealth>("/health", undefined, [503]),

	getTopology: async (): Promise<Topology> => {
		const traces = await listTraces();
		// Traces are newest first, so the first hit per target is its latest latency.
		const agents = AGENTS.map((agent) => ({
			...agent,
			lastLatencyMs:
				traces.find((t) => t.targetNodeId === agent.id)
					?.durationMs ?? null,
		}));
		return { agents, edges: EDGES };
	},

	listRuns,
	listTraces,

	listRecentEvents: async (): Promise<TelemetryEvent[]> => {
		const [runs, traces] = await Promise.all([
			listRuns(),
			listTraces(),
		]);
		const frames: TelemetryFrame[] = [
			...runs.flatMap((run): TelemetryFrame[] => [
				{
					type: "RUN_STARTED",
					runId: run.runId,
					timestamp: run.startedAt,
					summary: { fuzzerMode: run.fuzzerMode },
				},
				...(run.completedAt
					? [
							{
								type: "RUN_COMPLETED" as const,
								runId: run.runId,
								timestamp: run.completedAt,
								summary: {
									totalTraces:
										run.edges.reduce(
											(
												sum,
												e,
											) =>
												sum +
												e.total,
											0,
										),
								},
							},
						]
					: []),
			]),
			...traces.map(
				(trace): TelemetryFrame => ({
					type: "TRACE_EMITTED",
					runId: trace.runId,
					timestamp: trace.timestamp,
					trace,
				}),
			),
		];
		return frames
			.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
			.flatMap((frame) => frameToEvent(frame) ?? []);
	},

	ingestTrace: (input) =>
		request<IngestTraceResponse>("/v1/traces", {
			method: "POST",
			body: JSON.stringify(input),
		}),

	openTelemetry: (handlers: TelemetryHandlers): TelemetryConnection => {
		let socket: WebSocket | null = null;
		let closed = false;

		void (async () => {
			let url = telemetryUrl();
			if (getToken()) {
				// Browsers can't set headers on a WebSocket, so exchange the JWT for a 30s ticket.
				try {
					const { ticket } = await request<{
						ticket: string;
					}>("/v1/auth/ws-ticket", {
						method: "POST",
						body: "{}",
					});
					url += `?ticket=${encodeURIComponent(ticket)}`;
				} catch {
					if (!closed) handlers.onClose();
					return;
				}
			}
			if (closed) return;
			socket = new WebSocket(url);
			socket.onopen = () => handlers.onOpen();
			socket.onclose = () => handlers.onClose();
			socket.onmessage = (message) => {
				try {
					handlers.onFrame(
						JSON.parse(
							String(message.data),
						) as TelemetryFrame,
					);
				} catch {
					// Ignore frames that are not valid JSON.
				}
			};
		})();

		return {
			send: (action) => {
				if (socket?.readyState === WebSocket.OPEN)
					socket.send(JSON.stringify(action));
			},
			close: () => {
				closed = true;
				if (socket) {
					socket.onclose = null;
					socket.close();
				}
			},
		};
	},
};
