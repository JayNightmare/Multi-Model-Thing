import { describe, expect, it } from "vitest";
import { parsePrefs } from "../lib/prefs";
import { safeNext } from "../lib/routes";

describe("safeNext", () => {
	it("keeps in-app paths", () => {
		expect(safeNext("/app")).toBe("/app");
		expect(safeNext("/app/edges/synthesizer-decision-engine")).toBe(
			"/app/edges/synthesizer-decision-engine",
		);
		expect(safeNext("/app/report?run=1")).toBe("/app/report?run=1");
	});

	it("falls back to /app for anything else", () => {
		for (const bad of [
			null,
			undefined,
			"",
			"/",
			"/signin",
			"https://evil.example/app",
			"//evil.example/app",
			"/app//evil.example",
			"/app\\evil",
			"/application",
			"javascript:alert(1)",
		]) {
			expect(safeNext(bad)).toBe("/app");
		}
	});
});

describe("parsePrefs", () => {
	it("reads a valid fuzzer mode", () => {
		expect(
			parsePrefs('{"defaultFuzzerMode":"heuristic"}')
				.defaultFuzzerMode,
		).toBe("heuristic");
	});

	it("falls back to semantic for missing, invalid or corrupt data", () => {
		for (const raw of [
			null,
			"",
			"{}",
			"not json",
			'{"defaultFuzzerMode":"x"}',
		]) {
			expect(parsePrefs(raw).defaultFuzzerMode).toBe(
				"semantic",
			);
		}
	});
});
