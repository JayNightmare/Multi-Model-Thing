import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_API_URL = "https://gateway.nexusgit.info";

/** The gateway to talk to. Plain http is only accepted for local development. */
export function resolveApiUrl(raw = process.env.MML_API_URL): string {
	const value = (raw ?? DEFAULT_API_URL).trim().replace(/\/+$/, "");
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`MML_API_URL is not a valid URL: "${value}"`);
	}
	const local = ["localhost", "127.0.0.1", "[::1]"].includes(
		url.hostname,
	);
	if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
		throw new Error(
			"MML_API_URL must use https (http is only allowed for localhost)",
		);
	}
	return value;
}

/** Per-user state: the sign-in token lives here, never in a workspace. */
export function homeDir(): string {
	return process.env.MML_HOME ?? join(homedir(), ".mml");
}
