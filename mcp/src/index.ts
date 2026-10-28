#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { homeDir, resolveApiUrl } from "./config.js";
import { FileCredentialStore } from "./credentials.js";
import { createMmlServer } from "./server.js";

async function main(): Promise<void> {
	const server = createMmlServer({
		apiUrl: resolveApiUrl(),
		credentials: new FileCredentialStore(homeDir()),
	});
	await server.connect(new StdioServerTransport());
	// stdout carries the protocol, so diagnostics go to stderr only.
	console.error("mml-mcp ready");
}

main().catch((err) => {
	console.error(
		"mml-mcp failed to start:",
		err instanceof Error ? err.message : err,
	);
	process.exit(1);
});
