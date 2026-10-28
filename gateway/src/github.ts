import type { GithubAuthConfig } from "./config.js";

const TIMEOUT_MS = 10_000;

export function callbackUrl(cfg: GithubAuthConfig): string {
	return `${cfg.publicUrl}/v1/auth/github/callback`;
}

// No scope is requested: the public profile is enough to learn the login.
export function authorizeUrl(cfg: GithubAuthConfig, state: string): string {
	const url = new URL("https://github.com/login/oauth/authorize");
	url.searchParams.set("client_id", cfg.clientId);
	url.searchParams.set("redirect_uri", callbackUrl(cfg));
	url.searchParams.set("state", state);
	return url.toString();
}

export interface GithubProfile {
	login: string;
	name: string | null;
	avatarUrl: string | null;
}

// Only GitHub's avatar CDN is trusted, since the studio renders this URL in an <img>.
function safeAvatar(value: unknown): string | null {
	if (typeof value !== "string") return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" &&
			url.hostname === "avatars.githubusercontent.com"
			? url.toString()
			: null;
	} catch {
		return null;
	}
}

/** Exchanges an OAuth code for the user's GitHub profile. The GitHub access token is never stored. */
export async function fetchGithubLogin(
	cfg: GithubAuthConfig,
	code: string,
	fetchImpl: typeof fetch,
): Promise<GithubProfile> {
	const tokenRes = await fetchImpl(
		"https://github.com/login/oauth/access_token",
		{
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				client_id: cfg.clientId,
				client_secret: cfg.clientSecret,
				code,
				redirect_uri: callbackUrl(cfg),
			}),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		},
	);
	if (!tokenRes.ok)
		throw new Error(
			`GitHub token endpoint HTTP ${tokenRes.status}`,
		);
	const tokenBody = (await tokenRes.json()) as {
		access_token?: string;
		error?: string;
	};
	if (!tokenBody.access_token) {
		throw new Error(
			`GitHub rejected the code: ${tokenBody.error ?? "no token"}`,
		);
	}

	const userRes = await fetchImpl("https://api.github.com/user", {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${tokenBody.access_token}`,
			"User-Agent": "contract-gateway",
		},
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (!userRes.ok)
		throw new Error(`GitHub user endpoint HTTP ${userRes.status}`);
	const user = (await userRes.json()) as {
		login?: unknown;
		name?: unknown;
		avatar_url?: unknown;
	};
	const login = user.login;
	if (
		typeof login !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9-]*(\[bot\])?$/.test(login)
	) {
		throw new Error("GitHub returned an unexpected login");
	}
	return {
		login,
		name:
			typeof user.name === "string" && user.name.length <= 200
				? user.name
				: null,
		avatarUrl: safeAvatar(user.avatar_url),
	};
}
