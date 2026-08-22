/**
 * react-native-fast-image 桌面端实现
 * 基于react-native-web Image(底层 <img>),支持 FastImage 的常用 API 形状。
 */
import React from "react";
import { Image, ImageProps, StyleSheet } from "react-native";

export const resizeMode = {
    contain: "contain" as const,
    cover: "cover" as const,
    stretch: "stretch" as const,
    center: "center" as const,
};

export const priority = {
    low: "low" as const,
    normal: "normal" as const,
    high: "high" as const,
};

export const cacheControl = {
    immutable: "immutable" as const,
    web: "web" as const,
    cacheOnly: "cacheOnly" as const,
};

export interface FastImageProps extends Omit<ImageProps, "source"> {
    source: any;
    tintColor?: string;
}

function FastImageBase(props: FastImageProps, ref: any) {
    const { source, defaultSource, onLoad, onError, ...rest } = props;

    // FastImage source 形状: { uri, priority, cache, headers, method, body }
    let imageSource: any = source;
    if (source && typeof source === "object" && !Array.isArray(source)) {
        const { priority: _p, cache: _c, method: _m, body: _b, headers: _h, ...clean } = source;
        imageSource = clean;
    }
    if (typeof source === "string") {
        imageSource = { uri: source };
    }

    return (
        <Image
            ref={ref}
            source={imageSource}
            defaultSource={defaultSource as any}
            onLoad={onLoad as any}
            onError={onError as any}
            {...rest}
        />
    );
}

const FastImage = React.forwardRef(FastImageBase) as any;

FastImage.resizeMode = resizeMode;
FastImage.priority = priority;
FastImage.cacheControl = cacheControl;
FastImage.displayName = "FastImage";

export type { ImageStyle } from "react-native";

export default FastImage;
