import { useEffect, useState } from "react";
import ImageColors from "react-native-image-colors";
import Color from "color";
import { Image } from "react-native";
import { grayRate } from "@/utils/colorUtil";

/**
 * 从图片提取深色主色, 用于沉浸式页面背景
 * 提取结果偏亮时自动压暗, 保证深色文字对比度
 */
export default function useDarkDominantColor(
    source?: string | number,
): string {
    const [color, setColor] = useState("#000000");

    useEffect(() => {
        let mounted = true;
        if (source === undefined) {
            setColor("#000000");
            return;
        }
        const uri =
            typeof source === "number"
                ? Image.resolveAssetSource(source).uri ?? ""
                : source;
        ImageColors.getColors(uri, {
            fallback: "#000000",
            cache: true,
        })
            .then(result => {
                if (!mounted) {
                    return;
                }
                let extracted: string | undefined;
                if (result.platform === "android") {
                    extracted =
                        result.darkVibrant ??
                        result.darkMuted ??
                        result.dominant;
                } else if (result.platform === "ios") {
                    extracted = result.background ?? result.primary;
                } else {
                    extracted = result.dominant;
                }
                if (!extracted) {
                    setColor("#000000");
                    return;
                }
                // 偏亮则压暗, 保证整体氛围为深色
                if (grayRate(extracted) > 0.2) {
                    extracted = Color(extracted).darken(0.4).rgb().string();
                }
                setColor(extracted);
            })
            .catch(() => {
                if (mounted) {
                    setColor("#000000");
                }
            });
        return () => {
            mounted = false;
        };
    }, [source]);

    return color;
}
