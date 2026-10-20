import { useEffect } from "react";
import useColors from "@/hooks/useColors";
import { syncMusicWidgetColors } from "@/service/musicWidget";
import { resolveWidgetColors } from "@/utils/widgetColors";
import Theme from "@/core/theme";

export default function MusicWidgetThemeSync() {
    const colors = useColors();
    const { id } = Theme.useTheme();
    useEffect(() => {
        syncMusicWidgetColors(resolveWidgetColors(colors, id !== "p-light" && id !== "p-dark"));
    }, [colors, id]);
    return null;
}
