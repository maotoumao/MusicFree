import React from "react";
import { Platform, StatusBar, StatusBarProps, View } from "react-native";
import useColors from "@/hooks/useColors";
import Theme from "@/core/theme";

interface IStatusBarProps extends StatusBarProps {}

export default function (props: IStatusBarProps) {
    const colors = useColors();
    const theme = Theme.useTheme();
    const { backgroundColor, barStyle } = props;
    // On Android the app bar stays dark behind the status bar, so light icons
    // are used everywhere. iOS draws the status bar over the page background,
    // which is light in the light theme.
    const defaultBarStyle =
        Platform.OS === "ios" && !theme.dark
            ? "dark-content"
            : "light-content";

    return (
        <>
            <StatusBar
                backgroundColor={"rgba(0,0,0,0)"}
                barStyle={barStyle ?? defaultBarStyle}
            />
            <View
                style={{
                    zIndex: 10000,
                    position: "absolute",
                    top: 0,
                    backgroundColor:
                        backgroundColor ?? colors.appBar ?? colors.primary,
                    width: "100%",
                    height: StatusBar.currentHeight,
                }}
            />
        </>
    );
}
