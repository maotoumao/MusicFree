import React, { memo } from "react";
import { StatusBar, StyleSheet, useWindowDimensions, View } from "react-native";
import Image from "./image";
import useColors from "@/hooks/useColors";
import Theme from "@/core/theme";

function PageBackground() {
    const theme = Theme.useTheme();
    const background = Theme.useBackground();
    const { height: windowHeight } = useWindowDimensions();
    const colors = useColors();

    // https://github.com/facebook/react-native/issues/41918
    const height = windowHeight + (StatusBar.currentHeight ?? 0);

    return (
        <>
            <View
                style={[
                    style.wrapper,
                    {   
                        height,
                        backgroundColor:
                            colors?.pageBackground ?? colors.background,
                    },
                ]}
            />
            {!theme.id.startsWith("p-") && background?.url ? (
                <Image
                    uri={background.url}
                    style={[
                        style.wrapper,
                        {
                            height,
                            opacity: background?.opacity ?? 0.6,
                        },
                    ]}
                    blurRadius={background?.blur ?? 20}
                />
            ) : null}
        </>
    );
}
export default memo(PageBackground, () => true);

const style = StyleSheet.create({
    wrapper: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
    },
});
