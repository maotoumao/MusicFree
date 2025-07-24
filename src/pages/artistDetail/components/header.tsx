import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { useAtomValue } from "jotai";
import { scrollToTopAtom } from "../store/atoms";
import ThemeText from "@/components/base/themeText";
import Tag from "@/components/base/tag";
import { useParams } from "@/core/router";
import Image from "@/components/base/image";
import { ImgAsset } from "@/constants/assetsConst";
import { useI18N } from "@/core/i18n";

const headerHeight = rpx(350);

interface IHeaderProps {
    neverFold?: boolean;
}

export default function Header(props: IHeaderProps) {
    const { neverFold } = props;

    const { artistItem } = useParams<"artist-detail">();

    const heightValue = useSharedValue(headerHeight);
    const opacityValue = useSharedValue(1);
    const scrollToTopState = useAtomValue(scrollToTopAtom);

    const { t } = useI18N();

    const heightStyle = useAnimatedStyle(() => {
        return {
            height: heightValue.value,
            opacity: opacityValue.value,
        };
    });

    const avatar = artistItem.avatar?.startsWith("//")
        ? `https:${artistItem.avatar}`
        : artistItem.avatar;

    /** 折叠 */
    useEffect(() => {
        if (neverFold) {
            heightValue.value = withTiming(headerHeight);
            opacityValue.value = withTiming(1);
            return;
        }
        if (scrollToTopState) {
            heightValue.value = withTiming(headerHeight);
            opacityValue.value = withTiming(1);
        } else {
            heightValue.value = withTiming(0);
            opacityValue.value = withTiming(0);
        }
    }, [scrollToTopState, neverFold]);

    return (
        <Animated.View style={[styles.wrapper, heightStyle]}>
            <View style={styles.headerWrapper}>
                <Image
                    emptySrc={ImgAsset.albumDefault}
                    uri={avatar}
                    style={styles.artist}
                />
                <View style={styles.info}>
                    <View style={styles.title}>
                        <ThemeText
                            fontSize="title"
                            style={styles.titleText}
                            numberOfLines={1}
                            ellipsizeMode="tail">
                            {artistItem?.name ?? ""}
                        </ThemeText>
                        {artistItem.platform ? (
                            <Tag tagName={artistItem.platform} />
                        ) : null}
                    </View>

                    {artistItem.fans ? (
                        <ThemeText
                            fontSize="subTitle"
                            fontColor="textSecondary">
                            {t("artistDetail.fansCount", {
                                count: artistItem.fans,
                            })}
                        </ThemeText>
                    ) : null}
                </View>
            </View>

            <ThemeText
                style={styles.description}
                numberOfLines={2}
                ellipsizeMode="tail"
                fontColor="textSecondary"
                fontSize="description">
                {artistItem?.description ?? ""}
            </ThemeText>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        height: headerHeight,
        backgroundColor: "rgba(28, 28, 28, 0.1)",
        zIndex: 1,
    },
    artist: {
        width: rpx(144),
        height: rpx(144),
        borderRadius: rpx(16),
    },
    headerWrapper: {
        width: rpx(750),
        paddingTop: rpx(24),
        paddingHorizontal: rpx(24),
        height: rpx(240),
        flexDirection: "row",
        alignItems: "center",
    },
    info: {
        marginLeft: rpx(24),
        justifyContent: "space-around",
        height: rpx(144),
    },
    title: {
        flexDirection: "row",
        alignItems: "center",
    },
    titleText: {
        marginRight: rpx(18),
        maxWidth: rpx(400),
    },
    description: {
        marginTop: rpx(24),
        width: rpx(750),
        paddingHorizontal: rpx(24),
    },
});
