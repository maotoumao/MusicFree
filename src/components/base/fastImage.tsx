import React, { useEffect, useState } from "react";
import { ImageRequireSource } from "react-native";
import { Image, ImageProps } from "expo-image";

interface IImageProps {
    style: ImageProps["style"];
    defaultSource?: ImageProps["defaultSource"];
    placeholderSource?: ImageRequireSource;
    source?: ImageProps["source"] | string;
}
export default function (props: IImageProps) {
    const { style, placeholderSource, defaultSource, source } = props ?? {};
    const [isError, setIsError] = useState(false);


    let realSource: IImageProps["source"];
    if (typeof source === "string") {
        realSource = { uri: source };
        if (source.length === 0) {
            realSource = placeholderSource;
        }
    } else if (source){
        realSource = source;
    } else {
        realSource = placeholderSource;
    }


    useEffect(() => {
        setIsError(false);
    }, [source]);


    return (
        <Image
            style={style}
            source={isError ? placeholderSource : realSource}
            onError={() => {
                setIsError(true);
                console.error("Image load error:", realSource);
            }}
            defaultSource={defaultSource}
            placeholder={defaultSource}
        />
    );
}
