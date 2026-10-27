// Usage (from repo root): pm2 start ecosystem.config.cjs && pm2 save
// Secrets and CORS_ORIGIN come from ./.env (loaded by Node); values set here win over .env.
module.exports = {
	apps: [
		{
			name: "gateway",
			cwd: "./gateway",
			script: "dist/server.js",
			node_args: "--env-file=../.env",
			env: {
				NODE_ENV: "production",
				HOST: "127.0.0.1",
				PORT: "8000",
				FUZZER_URL: "http://127.0.0.1:8001",
				DUCKDB_PATH: "./data/traces.duckdb",
				TRUST_PROXY: "true",
			},
		},
		{
			// Runs in mock mode until a GGUF file exists at FUZZER_MODEL_PATH.
			name: "fuzzer",
			cwd: "./fuzzer",
			script: "./.venv/bin/python",
			args: "-m app.main",
			interpreter: "none",
			env: {
				HOST: "127.0.0.1",
				PORT: "8001",
				FUZZER_MODEL_PATH: "../models/model.gguf",
			},
		},
	],
};
