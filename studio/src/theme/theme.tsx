import {
	createDarkTheme,
	createLightTheme,
	type BrandVariants,
	type Theme,
} from "@fluentui/react-components";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "app-theme";
const PRIMARY = "#38bdf8";

function hexToHsl(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	const r = ((n >> 16) & 255) / 255;
	const g = ((n >> 8) & 255) / 255;
	const b = (n & 255) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	const h =
		max === r
			? (g - b) / d + (g < b ? 6 : 0)
			: max === g
				? (b - r) / d + 2
				: (r - g) / d + 4;
	return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return Math.round(255 * c)
			.toString(16)
			.padStart(2, "0");
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}

// 16-step brand ramp from the palette primary; the primary itself lands on step 100.
function makeBrandRamp(hex: string): BrandVariants {
	const [h, s] = hexToHsl(hex);
	const lightness = [
		0.06, 0.1, 0.15, 0.2, 0.26, 0.32, 0.38, 0.44, 0.5, 0.56, 0.6,
		0.66, 0.72, 0.8, 0.88, 0.95,
	];
	const keys = [
		10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140,
		150, 160,
	] as const;
	const ramp = Object.fromEntries(
		keys.map((k, i) => [k, hslToHex(h, s, lightness[i])]),
	);
	ramp[100] = hex;
	return ramp as unknown as BrandVariants;
}

const brand = makeBrandRamp(PRIMARY);

const shared: Partial<Theme> = {
	fontFamilyBase:
		"Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
	fontFamilyMonospace:
		"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
	borderRadiusSmall: "4px",
	borderRadiusMedium: "6px",
	borderRadiusLarge: "8px",
};

export const darkTheme: Theme = {
	...createDarkTheme(brand),
	...shared,
	colorNeutralBackground1: "#0b1120",
	colorNeutralBackground2: "#0e1628",
	colorNeutralBackground3: "#111a2e",
	colorNeutralBackground4: "#0e1628",
	colorNeutralForeground1: "#e2e8f0",
	colorNeutralForeground2: "#cbd5e1",
	colorNeutralForeground3: "#94a3b8",
	colorNeutralStroke1: "#1e293b",
	colorNeutralStroke2: "#1e293b",
	colorBrandBackground: PRIMARY,
	colorBrandForeground1: PRIMARY,
	colorBrandForegroundLink: PRIMARY,
	colorNeutralForegroundOnBrand: "#04121c",
};

export const lightTheme: Theme = {
	...createLightTheme(brand),
	...shared,
	colorBrandBackground: "#0284c7",
	colorBrandBackgroundHover: "#0369a1",
	colorBrandBackgroundPressed: "#075985",
};

interface ThemeModeValue {
	mode: ThemeMode;
	resolved: "light" | "dark";
	setMode: (mode: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeModeValue | null>(null);

function readMode(): ThemeMode {
	const stored = window.localStorage.getItem(STORAGE_KEY);
	return stored === "light" || stored === "dark" || stored === "system"
		? stored
		: "dark";
}

export function ThemeModeProvider({
	children,
}: {
	children: (theme: Theme, resolved: "light" | "dark") => ReactNode;
}) {
	const [mode, setModeState] = useState<ThemeMode>(readMode);
	const [systemDark, setSystemDark] = useState(
		() => window.matchMedia("(prefers-color-scheme: dark)").matches,
	);

	useEffect(() => {
		const query = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = (e: MediaQueryListEvent) =>
			setSystemDark(e.matches);
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, []);

	const setMode = useCallback((next: ThemeMode) => {
		window.localStorage.setItem(STORAGE_KEY, next);
		setModeState(next);
	}, []);

	const resolved: "light" | "dark" =
		mode === "system" ? (systemDark ? "dark" : "light") : mode;
	const value = useMemo(
		() => ({ mode, resolved, setMode }),
		[mode, resolved, setMode],
	);

	return (
		<ThemeModeContext.Provider value={value}>
			{children(
				resolved === "dark" ? darkTheme : lightTheme,
				resolved,
			)}
		</ThemeModeContext.Provider>
	);
}

export function useThemeMode(): ThemeModeValue {
	const ctx = useContext(ThemeModeContext);
	if (!ctx)
		throw new Error(
			"useThemeMode must be used inside ThemeModeProvider",
		);
	return ctx;
}
