import React from "react";
import { Image, ImageProps } from "react-native";

interface IImageProps extends ImageProps {
    uri?: string | null;
    emptySrc?: any;
}
export default function (props: Omit<IImageProps, "source">) {
    const { uri, emptySrc } = props;
    const source = typeof uri === "string"
        ? {
            uri,
        }
        : emptySrc;
    return <Image {...props} source={source} />;
}
