import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { TelemetryBroadcaster } from "../src/services/broadcaster.js";

function fakeSocket() {
	return {
		readyState: WebSocket.OPEN,
		send: vi.fn(),
		on: vi.fn(),
		ping: vi.fn(),
		terminate: vi.fn(),
	} as unknown as WebSocket & { send: ReturnType<typeof vi.fn> };
}

describe("TelemetryBroadcaster", () => {
	it("sends a frame only to the user it was produced for", () => {
		const broadcaster = new TelemetryBroadcaster(1_000_000);
		const alice = fakeSocket();
		const bob = fakeSocket();
		broadcaster.addClient(alice, "alice");
		broadcaster.addClient(bob, "bob");

		broadcaster.broadcast(
			{
				type: "RUN_COMPLETED",
				runId: "r1",
				timestamp: "t",
				projectId: "p",
				summary: { totalTraces: 1 },
			},
			"alice",
		);
		expect(alice.send).toHaveBeenCalledTimes(1);
		expect(bob.send).not.toHaveBeenCalled();
		broadcaster.destroy();
	});

	it("still reaches everyone when no login is given", () => {
		const broadcaster = new TelemetryBroadcaster(1_000_000);
		const a = fakeSocket();
		const b = fakeSocket();
		broadcaster.addClient(a, "alice");
		broadcaster.addClient(b, "bob");
		broadcaster.broadcast({
			type: "ERROR",
			timestamp: "t",
			error: { code: "INTERNAL_ERROR", message: "x" },
		});
		expect(a.send).toHaveBeenCalledTimes(1);
		expect(b.send).toHaveBeenCalledTimes(1);
		broadcaster.destroy();
	});
});
