import { createHash, randomBytes, randomInt } from "node:crypto";

// No vowels or look-alike characters, so codes are easy to read aloud and type.
const ALPHABET = "BCDFGHJKLMNPQRSTVWXZ23456789";
const TTL_MS = 10 * 60_000;
export const DEVICE_INTERVAL_SECONDS = 5;

type Status = "pending" | "approved" | "denied";

interface Entry {
	userCode: string;
	clientName: string;
	status: Status;
	login?: string;
	expiresAt: number;
	lastPoll: number;
}

export type PollResult =
	| { state: "pending" | "slow_down" | "denied" | "expired" }
	| { state: "approved"; login: string; clientName: string };

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export function normalizeUserCode(raw: string): string {
	const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
	return clean.length === 8
		? `${clean.slice(0, 4)}-${clean.slice(4)}`
		: clean;
}

/** OAuth device authorization state (RFC 8628). Held in memory: codes live ten minutes. */
export class DeviceFlow {
	private byDevice = new Map<string, Entry>();
	private byUser = new Map<string, string>();

	start(clientName: string): {
		deviceCode: string;
		userCode: string;
		expiresIn: number;
		interval: number;
	} {
		this.sweep();
		let userCode = "";
		do {
			const chars = Array.from(
				{ length: 8 },
				() => ALPHABET[randomInt(ALPHABET.length)],
			).join("");
			userCode = `${chars.slice(0, 4)}-${chars.slice(4)}`;
		} while (this.byUser.has(userCode));

		const deviceCode = randomBytes(32).toString("base64url");
		const hash = sha256(deviceCode);
		this.byDevice.set(hash, {
			userCode,
			clientName,
			status: "pending",
			expiresAt: Date.now() + TTL_MS,
			lastPoll: 0,
		});
		this.byUser.set(userCode, hash);
		return {
			deviceCode,
			userCode,
			expiresIn: TTL_MS / 1000,
			interval: DEVICE_INTERVAL_SECONDS,
		};
	}

	/** The pending request behind a code the user typed, for the approval page. */
	lookup(
		userCode: string,
	): { userCode: string; clientName: string } | null {
		const entry = this.pendingByUser(userCode);
		return entry
			? {
					userCode: entry.userCode,
					clientName: entry.clientName,
				}
			: null;
	}

	decide(userCode: string, login: string, approve: boolean): boolean {
		const entry = this.pendingByUser(userCode);
		if (!entry) return false;
		entry.status = approve ? "approved" : "denied";
		entry.login = login;
		return true;
	}

	poll(deviceCode: string): PollResult {
		const hash = sha256(deviceCode);
		const entry = this.byDevice.get(hash);
		if (!entry || entry.expiresAt <= Date.now()) {
			this.remove(hash);
			return { state: "expired" };
		}
		const now = Date.now();
		const tooFast =
			now - entry.lastPoll <
			DEVICE_INTERVAL_SECONDS * 1000 - 500;
		entry.lastPoll = now;
		if (tooFast) return { state: "slow_down" };
		if (entry.status === "pending") return { state: "pending" };
		this.remove(hash);
		return entry.status === "approved" && entry.login
			? {
					state: "approved",
					login: entry.login,
					clientName: entry.clientName,
				}
			: { state: "denied" };
	}

	private pendingByUser(userCode: string): Entry | null {
		const hash = this.byUser.get(normalizeUserCode(userCode));
		const entry = hash ? this.byDevice.get(hash) : undefined;
		return entry &&
			entry.status === "pending" &&
			entry.expiresAt > Date.now()
			? entry
			: null;
	}

	private remove(hash: string): void {
		const entry = this.byDevice.get(hash);
		if (entry) this.byUser.delete(entry.userCode);
		this.byDevice.delete(hash);
	}

	private sweep(): void {
		const now = Date.now();
		for (const [hash, entry] of this.byDevice) {
			if (entry.expiresAt <= now) this.remove(hash);
		}
	}
}
