import type { CredentialStore } from "./credentials.js";

export class GatewayError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly code?: string,
		readonly details?: unknown,
	) {
		super(message);
		this.name = "GatewayError";
	}
}

export class NotSignedInError extends Error {
	constructor(message = "Not signed in. Call mml_login first.") {
		super(message);
		this.name = "NotSignedInError";
	}
}

interface Options {
	auth?: boolean;
}

/** Thin fetch wrapper that adds the stored token and turns error bodies into messages. */
export class GatewayClient {
	constructor(
		readonly apiUrl: string,
		private readonly credentials: CredentialStore,
		private readonly fetchImpl: typeof fetch = fetch,
	) {}

	async request<T>(
		method: "GET" | "POST" | "PUT" | "DELETE",
		path: string,
		body?: unknown,
		{ auth = true }: Options = {},
	): Promise<T> {
		const headers: Record<string, string> = {
			Accept: "application/json",
		};
		if (body !== undefined)
			headers["Content-Type"] = "application/json";
		if (auth) {
			const credential = await this.credentials.get(
				this.apiUrl,
			);
			if (!credential) throw new NotSignedInError();
			headers.Authorization = `Bearer ${credential.token}`;
		}

		let res: Response;
		try {
			res = await this.fetchImpl(`${this.apiUrl}${path}`, {
				method,
				headers,
				body:
					body === undefined
						? undefined
						: JSON.stringify(body),
				signal: AbortSignal.timeout(30_000),
			});
		} catch (err) {
			throw new Error(
				`Could not reach ${this.apiUrl}: ${(err as Error).message}`,
			);
		}

		const text = await res.text();
		let data: unknown = null;
		try {
			data = text ? JSON.parse(text) : null;
		} catch {
			// Non-JSON bodies are reported by status below.
		}
		if (res.ok) return data as T;

		if (res.status === 401 && auth) {
			await this.credentials.delete(this.apiUrl);
			throw new NotSignedInError(
				"Your sign-in expired or was revoked. Call mml_login again.",
			);
		}
		const envelope = data as {
			error?:
				| {
						code?: string;
						message?: string;
						details?: unknown;
				  }
				| string;
		} | null;
		const err = envelope?.error;
		if (typeof err === "string")
			throw new GatewayError(res.status, err, err);
		throw new GatewayError(
			res.status,
			err?.message ?? `Gateway returned HTTP ${res.status}`,
			err?.code,
			err?.details,
		);
	}
}
