import Color from "color";
import type { CustomizedColors } from "@/hooks/useColors";
import palette from "@/constants/widgetPalette.json";

export type WidgetColors = typeof palette.light;
export type WidgetAppearances = { light: WidgetColors; dark: WidgetColors };

/** A picker appearance stays stable when the app changes between its preset themes. */
export function resolveWidgetColors(colors: CustomizedColors, customPrimary = false): WidgetAppearances {
    function appearance(preset: WidgetColors): WidgetColors {
        if (!customPrimary) return { ...preset };
        let original;
        try {
            original = Color(colors.primary).alpha(1);
        } catch {
            original = Color(preset.primary);
        }
        let primary = original.hex();
        const surface = Color(preset.surface);
        const target = Color("#000000").contrast(surface) > Color("#FFFFFF").contrast(surface) ? "#000000" : "#FFFFFF";
        for (let step = 1; Color(primary).contrast(surface) < 3 && step <= 100; step++) {
            primary = original.mix(Color(target), step / 100).hex();
        }
        const onPrimary = Color("#FFFFFF").contrast(Color(primary)) >= 3 ? "#FFFFFF" : "#000000";
        return { ...preset, primary, onPrimary };
    }
    return { light: appearance(palette.light), dark: appearance(palette.dark) };
}
