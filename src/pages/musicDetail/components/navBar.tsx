import React, { useEffect } from "react";
import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import rpx from "@/utils/rpx";
import { useNavigation } from "@react-navigation/native";
import { fontSizeConst, fontWeightConst } from "@/constants/uiConst";
import Share from "react-native-share";
import { B64Asset } from "@/constants/assetsConst";
import IconButton from "@/components/base/iconButton";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import useOrientation from "@/hooks/useOrientation";

interface IProps {
    pageIndex: number;
    onTabChange: (index: number) => void;
}

export default function NavBar({ pageIndex, onTabChange }: IProps) {
    const navigation = useNavigation();
    const offset = useSharedValue(0);
    const orientation = useOrientation();

    useEffect(() => {
        offset.value = withTiming(pageIndex * rpx(140)); 
    }, [pageIndex, offset]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: offset.value }],
        };
    });

    return (
        <View style={styles.container}>
            <IconButton
                name="arrow-left"
                sizeType={"normal"}
                color="white"
                style={styles.button}
                onPress={() => {
                    navigation.goBack();
                }}
            />
            {orientation === "vertical" && (
                <View style={styles.centerContainer}>
                    <View style={styles.tabContainer}>
                        <TouchableOpacity 
                            activeOpacity={0.8}
                            onPress={() => onTabChange(0)} 
                            style={styles.tabItem}>
                            <Text style={[styles.tabText, pageIndex === 0 && styles.activeTabText]}>歌曲</Text>
                        </TouchableOpacity>
                        <View style={styles.divider}>
                            <Text style={styles.dividerText}>|</Text>
                        </View>
                        <TouchableOpacity 
                            activeOpacity={0.8}
                            onPress={() => onTabChange(1)} 
                            style={styles.tabItem}>
                            <Text style={[styles.tabText, pageIndex === 1 && styles.activeTabText]}>歌词</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.underlineContainer}>
                        <Animated.View style={[styles.underline, animatedStyle]} />
                    </View>
                </View>
            )}
            <IconButton
                name="share"
                color="white"
                sizeType="normal"
                style={styles.button}
                onPress={async () => {
                    try {
                        await Share.open({
                            type: "image/jpeg",
                            title: "MusicFree-一个插件化的免费音乐播放器",
                            message: "MusicFree-一个插件化的免费音乐播放器",
                            url: B64Asset.share,
                            subject: "MusicFree分享",
                        });
                    } catch {}
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        height: rpx(120),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    button: {
        marginHorizontal: rpx(24),
    },
    centerContainer: {
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
    },
    tabContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
    tabItem: {
        width: rpx(120),
        alignItems: "center",
        justifyContent: "center",
    },
    tabText: {
        color: "rgba(255,255,255,0.6)",
        fontSize: fontSizeConst.content,
        fontWeight: fontWeightConst.medium,
    },
    activeTabText: {
        color: "white",
        fontWeight: fontWeightConst.semibold,
    },
    divider: {
        width: rpx(20),
        alignItems: "center",
        justifyContent: "center",
    },
    dividerText: {
        color: "rgba(255,255,255,0.3)",
        fontSize: fontSizeConst.subTitle,
    },
    underlineContainer: {
        position: "absolute",
        bottom: rpx(26),
        left: 0,
        width: rpx(260), // 120 + 20 + 120
        alignItems: "flex-start", 
    },
    underline: {
        width: rpx(50),
        height: rpx(6),
        backgroundColor: "white", // Or theme color
        borderRadius: rpx(3),
        // Center the underline relative to the tab item
        marginLeft: rpx(35), 
        marginTop: rpx(10),
    },
});
