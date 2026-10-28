import type { FuzzerMode } from "../types";

const KEY = "app-prefs";

export interface Prefs {
	defaultFuzzerMode: FuzzerMode;
}

const DEFAULTS: Prefs = { defaultFuzzerMode: "semantic" };

export function parsePrefs(raw: string | null): Prefs {
	try {
		const value = JSON.parse(raw ?? "{}") as Partial<Prefs>;
		return {
			defaultFuzzerMode:
				value.defaultFuzzerMode === "heuristic" ||
				value.defaultFuzzerMode === "semantic"
					? value.defaultFuzzerMode
					: DEFAULTS.defaultFuzzerMode,
		};
	} catch {
		return DEFAULTS;
	}
}

export function loadPrefs(): Prefs {
	return parsePrefs(localStorage.getItem(KEY));
}

export function savePrefs(prefs: Prefs): void {
	localStorage.setItem(KEY, JSON.stringify(prefs));
}
