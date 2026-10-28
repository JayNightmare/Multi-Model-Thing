import { Button, Tooltip } from "@fluentui/react-components";
import {
	DesktopRegular,
	WeatherMoonRegular,
	WeatherSunnyRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useThemeMode, type ThemeMode } from "../theme/theme";

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
	dark: "light",
	light: "system",
	system: "dark",
};
const MODE_ICON: Record<ThemeMode, ReactElement> = {
	dark: <WeatherMoonRegular />,
	light: <WeatherSunnyRegular />,
	system: <DesktopRegular />,
};

export function ThemeToggle() {
	const { mode, setMode } = useThemeMode();
	return (
		<Tooltip content={`Theme: ${mode}`} relationship="label">
			<Button
				appearance="subtle"
				icon={MODE_ICON[mode]}
				onClick={() => setMode(NEXT_MODE[mode])}
				aria-label="Toggle theme"
			/>
		</Tooltip>
	);
}
