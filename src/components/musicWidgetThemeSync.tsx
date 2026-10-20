import { useEffect } from "react";
import useColors from "@/hooks/useColors";
import { syncMusicWidgetColors } from "@/service/musicWidget";
import { resolveWidgetColors } from "@/utils/widgetColors";

export default function MusicWidgetThemeSync() {
    const colors = useColors();
    useEffect(() => {
        syncMusicWidgetColors(resolveWidgetColors(colors));
    }, [colors]);
    return null;
}
