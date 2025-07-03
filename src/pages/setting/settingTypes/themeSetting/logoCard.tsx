import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import useColors from "@/hooks/useColors";
import ThemeText from "@/components/base/themeText";

interface ILogoCardProps {
    selected?: boolean;
    logo: number;
    onPress?: () => void;
    title?: string;
}
export default function LogoCard(props: ILogoCardProps) {
    const { selected, logo, onPress, title } = props;

    const colors = useColors();

    return (
        <View>
            <Pressable
                onPress={onPress}
                style={[
                    styles.borderContainer,
                    selected
                        ? {
                            borderWidth: 2,
                            borderStyle: "solid",
                            borderColor: colors.primary,
                        }
                        : null,
                ]}>
                <View style={styles.imageContainer}>
                    <Image style={styles.image} source={logo} />
                </View>
            </Pressable>
            <ThemeText
                numberOfLines={1}
                fontSize="subTitle"
                style={styles.title}
                fontColor={selected ? "primary" : "text"}>
                {title}
            </ThemeText>
        </View>
    );
}

const styles = StyleSheet.create({
    borderContainer: {
        width: rpx(160),
        height: rpx(160),
        borderRadius: rpx(22),
        marginRight: rpx(24),
        justifyContent: "center",
        alignItems: "center",
    },
    imageContainer: {
        width: rpx(136),
        height: rpx(136),
        borderRadius: rpx(12),
    },
    title: {
        textAlign: "center",
        marginTop: rpx(12),
        width: rpx(160),
    },
    image: {
        width: "100%",
        height: "100%",
        borderRadius: rpx(12),
    },
});
