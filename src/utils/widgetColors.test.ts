import Color from "color";
import { resolveWidgetColors } from "./widgetColors";
import palette from "@/constants/widgetPalette.json";
import type { CustomizedColors } from "@/hooks/useColors";

it("preserves both approved picker appearances regardless of the app preset theme", () => {
    expect(resolveWidgetColors({ primary: "#f17d34" } as CustomizedColors)).toEqual(palette);
    expect(resolveWidgetColors({ primary: "#3FA3B5" } as CustomizedColors)).toEqual(palette);
    expect(palette.light.surface).toBe("#FFFFFF");
    expect(palette.dark.surface).toBe("#18233C");
});

it.each(["#3867F4", "#6D8DFF", "#FFFFFF", "#000000", "rgba(255,255,255,0)", "invalid"])("keeps both appearances readable with custom primary %s", primary => {
    const colors = { primary } as CustomizedColors;
    const result = resolveWidgetColors(colors, true);
    for (const appearance of Object.values(result)) {
        for (const value of Object.values(appearance)) expect(value).toMatch(/^#[A-F0-9]{6}$/);
        expect(Color(appearance.text).contrast(Color(appearance.surface))).toBeGreaterThanOrEqual(4.5);
        expect(Color(appearance.secondary).contrast(Color(appearance.surface))).toBeGreaterThanOrEqual(4.5);
        expect(Color(appearance.primary).contrast(Color(appearance.surface))).toBeGreaterThanOrEqual(3);
        expect(Color(appearance.onPrimary).contrast(Color(appearance.primary))).toBeGreaterThanOrEqual(3);
        expect(appearance.onDiscovery).toBe("#FFFFFF");
    }
    expect(colors.primary).toBe(primary);
});
