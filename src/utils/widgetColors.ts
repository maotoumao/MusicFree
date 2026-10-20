import Color from "color";
import type { CustomizedColors } from "@/hooks/useColors";

export type WidgetColors = {
    surface: string;
    text: string;
    secondary: string;
    primary: string;
    onPrimary: string;
};

const black = "#000000";
const white = "#FFFFFF";

/** Resolve alpha against a known surface: wallpaper must not affect contrast. */
function opaque(value: string, background: string) {
    const foreground = Color(value);
    return foreground.alpha(1).mix(Color(background).alpha(1), 1 - foreground.alpha()).hex();
}

function readable(value: string, surface: string, ratio: number) {
    const preferred = opaque(value, surface);
    if (Color(preferred).contrast(Color(surface)) >= ratio) return preferred;
    return Color(black).contrast(Color(surface)) > Color(white).contrast(Color(surface)) ? black : white;
}

/** Consume the existing theme without changing its stored colors or opacity. */
export function resolveWidgetColors(colors: CustomizedColors): WidgetColors {
    const page = opaque(colors.pageBackground ?? white, white);
    const surface = opaque(colors.musicBar ?? colors.card, page);
    const text = readable(colors.musicBarText ?? colors.text, surface, 4.5);
    const secondary = readable(colors.textSecondary ?? text, surface, 4.5);
    let primary = opaque(colors.primary, surface);
    const target = readable(primary, surface, 3);
    const original = Color(primary);
    for (let step = 1; Color(primary).contrast(Color(surface)) < 3 && step <= 100; step++) {
        primary = original.mix(Color(target), step / 100).hex();
    }
    return { surface, text, secondary, primary, onPrimary: readable(white, primary, 3) };
}
