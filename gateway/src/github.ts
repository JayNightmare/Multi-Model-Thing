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

/** Exchanges an OAuth code for the user's GitHub login. The GitHub access token is never stored. */
export async function fetchGithubLogin(
	cfg: GithubAuthConfig,
	code: string,
	fetchImpl: typeof fetch,
): Promise<string> {
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
	const login = ((await userRes.json()) as { login?: unknown }).login;
	if (
		typeof login !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9-]*(\[bot\])?$/.test(login)
	) {
		throw new Error("GitHub returned an unexpected login");
	}
	return login;
}
