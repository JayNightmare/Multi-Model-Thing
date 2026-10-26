import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
	it("uses local defaults", () => {
		const config = loadConfig({});
		expect(config.port).toBe(8000);
		expect(config.duckdbPath).toBe("./data/traces.duckdb");
		expect(config.fuzzerUrl).toBe("http://localhost:8001");
	});

	it("strips trailing slashes from FUZZER_URL", () => {
		expect(
			loadConfig({ FUZZER_URL: "http://fuzzer:8001//" })
				.fuzzerUrl,
		).toBe("http://fuzzer:8001");
	});

	it("rejects an invalid port", () => {
		expect(() => loadConfig({ PORT: "abc" })).toThrow(
			/Invalid PORT/,
		);
	});
});
