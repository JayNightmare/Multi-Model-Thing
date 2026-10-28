export interface GithubAuthConfig {
	clientId: string;
	clientSecret: string;
	/** Lower-cased GitHub logins allowed to sign in. */
	allowedUsers: string[];
	/** Public base URL of this gateway; the OAuth callback lives under it. */
	publicUrl: string;
	/** Where the browser is sent after sign-in. */
	studioUrl: string;
}

export interface AuthConfig {
	enabled: boolean;
	password: string;
	github: GithubAuthConfig | null;
	jwtSecret: string;
	ttlSeconds: number;
}

export interface AppConfig {
	auth: AuthConfig;
	/** Bump when the Terms or Privacy Policy change; users must accept the new version at sign-in. */
	legalVersion: string;
	trustProxy: boolean;
	port: number;
	host: string;
	duckdbPath: string;
	fuzzerUrl: string;
	corsOrigins: (string | RegExp)[] | true;
	logLevel: string;
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function parseOrigins(raw: string | undefined): (string | RegExp)[] | true {
	if (!raw || raw.trim() === "") return [LOCAL_ORIGIN];
	if (raw.trim() === "*") return true;
	return raw
		.split(",")
		.map((o) => o.trim())
		.filter(Boolean);
}

function requireUrl(env: NodeJS.ProcessEnv, name: string): string {
	const raw = env[name]?.trim();
	if (!raw)
		throw new Error(
			`${name} is required when GITHUB_CLIENT_ID is set`,
		);
	try {
		new URL(raw);
	} catch {
		throw new Error(`Invalid ${name} "${raw}"`);
	}
	return raw.replace(/\/+$/, "");
}

function loadGithubConfig(env: NodeJS.ProcessEnv): GithubAuthConfig | null {
	const clientId = env.GITHUB_CLIENT_ID?.trim();
	if (!clientId) return null;
	const clientSecret = env.GITHUB_CLIENT_SECRET?.trim();
	if (!clientSecret) {
		throw new Error(
			"GITHUB_CLIENT_SECRET is required when GITHUB_CLIENT_ID is set",
		);
	}
	const allowedUsers = (env.GITHUB_ALLOWED_USERS ?? "")
		.split(",")
		.map((u) => u.trim().toLowerCase())
		.filter(Boolean);
	// Without an allowlist any GitHub account could sign in.
	if (allowedUsers.length === 0) {
		throw new Error(
			"GITHUB_ALLOWED_USERS must list at least one login",
		);
	}
	return {
		clientId,
		clientSecret,
		allowedUsers,
		publicUrl: requireUrl(env, "PUBLIC_URL"),
		studioUrl: requireUrl(env, "STUDIO_URL"),
	};
}

// Auth is on when AUTH_PASSWORD or GITHUB_CLIENT_ID is set; JWT_SECRET is then mandatory.
function loadAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
	const password = env.AUTH_PASSWORD ?? "";
	const github = loadGithubConfig(env);
	const jwtSecret = env.JWT_SECRET ?? "";
	const ttlSeconds = Number(env.JWT_TTL_SECONDS ?? 3600);
	if (!password && !github) {
		return {
			enabled: false,
			password,
			github,
			jwtSecret,
			ttlSeconds,
		};
	}
	if (jwtSecret.length < 32) {
		throw new Error(
			"JWT_SECRET must be at least 32 characters when authentication is enabled",
		);
	}
	if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60) {
		throw new Error(
			`Invalid JWT_TTL_SECONDS "${env.JWT_TTL_SECONDS}"`,
		);
	}
	return { enabled: true, password, github, jwtSecret, ttlSeconds };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
	const port = Number(env.PORT ?? 8000);
	if (!Number.isInteger(port) || port < 0 || port > 65535) {
		throw new Error(`Invalid PORT "${env.PORT}"`);
	}
	return {
		auth: loadAuthConfig(env),
		legalVersion: env.LEGAL_VERSION?.trim() || "1",
		trustProxy: env.TRUST_PROXY === "true",
		port,
		host: env.HOST ?? "0.0.0.0",
		duckdbPath: env.DUCKDB_PATH ?? "./data/traces.duckdb",
		fuzzerUrl: (env.FUZZER_URL ?? "http://localhost:8001").replace(
			/\/+$/,
			"",
		),
		corsOrigins: parseOrigins(env.CORS_ORIGIN),
		logLevel: env.LOG_LEVEL ?? "info",
	};
}
