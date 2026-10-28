import { WebSocket } from "ws";
import type { TraceRecord } from "../contracts/interceptor.js";
import type { ErrorCode } from "../errors.js";

export type TelemetryFrame =
	| {
			type: "RUN_STARTED";
			runId: string;
			timestamp: string;
			summary: {
				fuzzerMode: string;
				edgeId?: string;
				seed?: string;
			};
	  }
	| {
			type: "TRACE_EMITTED";
			runId: string;
			timestamp: string;
			trace: TraceRecord;
	  }
	| {
			type: "RUN_COMPLETED";
			runId: string;
			timestamp: string;
			summary: { totalTraces: number };
	  }
	| {
			type: "ERROR";
			timestamp: string;
			error: { code: ErrorCode; message: string };
	  };

export class TelemetryBroadcaster {
	private clients = new Set<WebSocket>();
	private heartbeat?: NodeJS.Timeout;

	constructor(private readonly heartbeatMs = 30_000) {
		this.heartbeat = setInterval(
			() => this.ping(),
			this.heartbeatMs,
		);
		this.heartbeat.unref();
	}

	get clientCount(): number {
		return this.clients.size;
	}

	addClient(ws: WebSocket): void {
		this.clients.add(ws);
		ws.on("close", () => this.clients.delete(ws));
		ws.on("error", () => this.clients.delete(ws));
	}

	broadcast(frame: TelemetryFrame): void {
		const raw = JSON.stringify(frame);
		for (const client of this.clients) {
			if (client.readyState === WebSocket.OPEN)
				client.send(raw);
		}
	}

	send(ws: WebSocket, frame: TelemetryFrame): void {
		if (ws.readyState === WebSocket.OPEN)
			ws.send(JSON.stringify(frame));
	}

	destroy(): void {
		if (this.heartbeat) clearInterval(this.heartbeat);
		for (const client of this.clients) client.terminate();
		this.clients.clear();
	}

	private ping(): void {
		for (const client of this.clients) {
			if (client.readyState === WebSocket.OPEN) client.ping();
			else this.clients.delete(client);
		}
	}
}
