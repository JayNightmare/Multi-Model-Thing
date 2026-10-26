import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const gatewayUrl = process.env.GATEWAY_PROXY_URL ?? "http://localhost:8000";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	// Embeddable in the Approve UI webview iframe: reachable from forwarded hosts, free port fallback.
	server: {
		host: true,
		allowedHosts: true,
		strictPort: false,
		proxy: {
			"/health": gatewayUrl,
			"/v1": { target: gatewayUrl, ws: true },
		},
	},
	test: {
		environment: "node",
		include: ["src/tests/**/*.test.{ts,tsx}"],
		passWithNoTests: true,
	},
});
