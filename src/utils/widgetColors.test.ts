import Color from "color";
import { resolveWidgetColors } from "./widgetColors";
import type { CustomizedColors } from "@/hooks/useColors";

it.each([
    { musicBar: "#f2f2f2", text: "#333333", primary: "#f17d34" },
    { musicBar: "#262626", text: "#fcfcfc", primary: "#3FA3B5" },
    { musicBar: "rgba(255,255,255,0.1)", text: "#ffffff", primary: "#fafafa" },
    { musicBar: "#000000", text: "#000000", primary: "#000000" },
    { musicBar: "#ffffff", text: "#ffffff", primary: "rgba(255,255,255,0)" },
])("keeps theme colors readable on an opaque widget surface: %p", input => {
    const colors = { card: "#262626", pageBackground: "#202020", textSecondary: "rgba(255,255,255,0.2)", ...input } as CustomizedColors;
    const before = { ...colors };
    const result = resolveWidgetColors(colors);
    for (const value of Object.values(result)) expect(value).toMatch(/^#[A-F0-9]{6}$/);
    expect(Color(result.text).contrast(Color(result.surface))).toBeGreaterThanOrEqual(4.5);
    expect(Color(result.secondary).contrast(Color(result.surface))).toBeGreaterThanOrEqual(4.5);
    expect(Color(result.primary).contrast(Color(result.surface))).toBeGreaterThanOrEqual(3);
    expect(Color(result.onPrimary).contrast(Color(result.primary))).toBeGreaterThanOrEqual(3);
    expect(colors).toEqual(before);
});

it("preserves custom colors when their contrast is sufficient", () => {
    expect(resolveWidgetColors({ card: "#ffffff", text: "#000000", primary: "#0055AA" } as CustomizedColors))
        .toEqual(expect.objectContaining({ surface: "#FFFFFF", text: "#000000", primary: "#0055AA" }));
});
