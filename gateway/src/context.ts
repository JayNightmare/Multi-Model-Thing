import type { SemanticLocalFuzzer } from "./fuzzers/semantic.js";
import type { AuthService } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { RunService } from "./services/run-service.js";
import type { TelemetryBroadcaster } from "./services/broadcaster.js";
import type { TraceStore } from "./storage/duckdb.js";

export interface AppContext {
	config: AppConfig;
	auth: AuthService;
	store: TraceStore;
	broadcaster: TelemetryBroadcaster;
	runService: RunService;
	semanticFuzzer: SemanticLocalFuzzer;
}
