export interface AuthConfig {
	enabled: boolean;
	password: string;
	jwtSecret: string;
	ttlSeconds: number;
}

export interface AppConfig {
	auth: AuthConfig;
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

// Auth is off unless AUTH_PASSWORD is set; JWT_SECRET is then mandatory.
function loadAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
	const password = env.AUTH_PASSWORD ?? "";
	const jwtSecret = env.JWT_SECRET ?? "";
	const ttlSeconds = Number(env.JWT_TTL_SECONDS ?? 3600);
	if (!password) {
		return { enabled: false, password, jwtSecret, ttlSeconds };
	}
	if (jwtSecret.length < 32) {
		throw new Error(
			"JWT_SECRET must be at least 32 characters when AUTH_PASSWORD is set",
		);
	}
	if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60) {
		throw new Error(
			`Invalid JWT_TTL_SECONDS "${env.JWT_TTL_SECONDS}"`,
		);
	}
	return { enabled: true, password, jwtSecret, ttlSeconds };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
	const port = Number(env.PORT ?? 8000);
	if (!Number.isInteger(port) || port < 0 || port > 65535) {
		throw new Error(`Invalid PORT "${env.PORT}"`);
	}
	return {
		auth: loadAuthConfig(env),
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
