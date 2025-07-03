import Image from "@/components/base/image";
import ThemeText from "@/components/base/themeText";
import { showPanel } from "@/components/panels/usePanel";
import { ImgAsset } from "@/constants/assetsConst";
import globalStyle from "@/constants/globalStyle";
import pathConst from "@/constants/pathConst";
import { useI18N } from "@/core/i18n";
import Theme from "@/core/theme";
import { CustomizedColors } from "@/hooks/useColors";
import { grayRate } from "@/utils/colorUtil";
import rpx from "@/utils/rpx";
import Slider from "@react-native-community/slider";
import Color from "color";
import React from "react";
import { StyleSheet, View } from "react-native";
import { copyFile } from "react-native-fs";
import { ScrollView, TouchableOpacity } from "react-native-gesture-handler";
import ImageColors from "react-native-image-colors";
import { launchImageLibrary } from "react-native-image-picker";

export default function Body() {
    const theme = Theme.useTheme();
    const backgroundInfo = Theme.useBackground();
    const { t } = useI18N();

    async function onImageClick() {
        try {
            const result = await launchImageLibrary({
                mediaType: "photo",
            });
            const uri = result.assets?.[0].uri;
            if (!uri) {
                return;
            }

            const bgPath = `${pathConst.dataPath}background${uri.substring(
                uri.lastIndexOf("."),
            )}`;
            await copyFile(uri, bgPath);

            const colorsResult = await ImageColors.getColors(uri, {
                fallback: "#ffffff",
            });
            const colors = {
                primary:
                    colorsResult.platform === "android"
                        ? colorsResult.dominant
                        : colorsResult.platform === "ios"
                            ? colorsResult.primary
                            : colorsResult.vibrant,
                average:
                    colorsResult.platform === "android"
                        ? colorsResult.average
                        : colorsResult.platform === "ios"
                            ? colorsResult.detail
                            : colorsResult.dominant,
                vibrant:
                    colorsResult.platform === "android"
                        ? colorsResult.vibrant
                        : colorsResult.platform === "ios"
                            ? colorsResult.secondary
                            : colorsResult.vibrant,
            };

            const primaryGrayRate = grayRate(colors.primary!);

            let themeColors: Partial<CustomizedColors>;
            if (primaryGrayRate < -0.4) {
                const primaryColor = Color(colors.primary!);

                console.log(
                    colors.primary,
                    primaryGrayRate,
                    primaryColor
                        .whiten(3 * primaryGrayRate)
                        .hex()
                        .toString(),
                );
                themeColors = {
                    appBar: colors.primary,
                    primary: primaryColor
                        .darken(primaryGrayRate * 5)
                        .toString(),
                    musicBar: colors.primary,
                    card: "rgba(0,0,0,0.2)",
                    tabBar: primaryColor.alpha(0.2).toString(),
                };
            } else if (primaryGrayRate > 0.4) {
                themeColors = {
                    appBar: colors.primary,
                    primary: Color(colors.primary)
                        .darken(primaryGrayRate * 5)
                        .toString(),
                    musicBar: colors.primary,
                    card: "rgba(0,0,0,0.2)",
                };
            } else {
                // const primaryColor = Color(colors.primary!);

                themeColors = {
                    appBar: colors.primary,
                    primary: Color(colors.primary)
                        .saturate(Math.abs(primaryGrayRate) * 2 + 2)
                        .toString(),
                    musicBar: colors.primary,
                    card: "rgba(0,0,0,0.2)",
                };
            }

            Theme.setTheme("custom", {
                colors: themeColors,
                background: {
                    url: `file://${bgPath}#${Date.now()}`,
                },
            });
            // Config.set('setting.theme.colors', {
            //     primary: primaryColor,
            //     textHighlight: textHighlight,
            //     accent: textHighlight,
            // });
        } catch (e) {
            console.log(e);
        }
    }

    return (
        <ScrollView style={globalStyle.fwflex1}>
            <TouchableOpacity onPress={onImageClick}>
                <Image
                    style={styles.image}
                    uri={backgroundInfo?.url}
                    emptySrc={ImgAsset.addBackground}
                />
            </TouchableOpacity>

            <View style={styles.sliderWrapper}>
                <ThemeText>{t("setCustomTheme.blur")}</ThemeText>
                <Slider
                    style={styles.slider}
                    minimumTrackTintColor={theme.colors.primary}
                    maximumTrackTintColor={theme.colors.text ?? "#999999"}
                    thumbTintColor={theme.colors.primary}
                    minimumValue={0}
                    step={1}
                    maximumValue={30}
                    onSlidingComplete={val => {
                        Theme.setBackground({
                            blur: val,
                        });
                    }}
                    value={backgroundInfo?.blur ?? 20}
                />
            </View>
            <View style={styles.sliderWrapper}>
                <ThemeText>{t("setCustomTheme.opacity")}</ThemeText>
                <Slider
                    style={styles.slider}
                    minimumTrackTintColor={theme.colors.primary}
                    maximumTrackTintColor={theme.colors.text ?? "#999999"}
                    thumbTintColor={theme.colors.primary}
                    minimumValue={0.3}
                    step={0.01}
                    maximumValue={1}
                    onSlidingComplete={val => {
                        Theme.setBackground({
                            opacity: val,
                        });
                    }}
                    value={backgroundInfo?.opacity ?? 0.7}
                />
            </View>
            <View style={styles.colorsContainer}>
                {Theme.configableColorKey.map(key => (
                    <View key={key} style={styles.colorItem}>
                        <ThemeText>{t("setCustomTheme." + key + "Color" as any)}</ThemeText>
                        <TouchableOpacity
                            onPress={() => {
                                showPanel("ColorPicker", {
                                    // @ts-ignore
                                    defaultColor: theme.colors[key],
                                    onSelected(color) {
                                        Theme.setColors({
                                            [key]: color.hexa().toString(),
                                        });
                                    },
                                });
                            }}
                            style={styles.colorItemBlockContainer}>
                            <View style={[styles.colorBlockContainer]}>
                                <Image
                                    resizeMode="repeat"
                                    emptySrc={ImgAsset.transparentBg}
                                    style={styles.transparentBg}
                                />
                                <View
                                    style={[
                                        {
                                            /** @ts-ignore */
                                            backgroundColor: theme.colors[key],
                                        },
                                        styles.colorBlock,
                                    ]}
                                />
                            </View>
                            <ThemeText
                                fontSize="subTitle"
                                style={styles.colorText}>
                                {
                                    /** @ts-ignore */
                                    Color(theme.colors[key]).hexa().toString()
                                }
                            </ThemeText>
                        </TouchableOpacity>
                    </View>
                ))}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        width: "100%",
        flex: 1,
    },
    image: {
        marginTop: rpx(36),
        borderRadius: rpx(12),
        width: rpx(460),
        height: rpx(690),
        alignSelf: "center",
    },
    sliderWrapper: {
        marginTop: rpx(48),
        width: "100%",
        paddingHorizontal: rpx(24),
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    slider: {
        flex: 1,
        height: rpx(40),
    },
    colorsContainer: {
        width: "100%",
        flex: 1,
        flexDirection: "row",
        flexWrap: "wrap",
        marginTop: rpx(48),
        paddingHorizontal: rpx(24),
        justifyContent: "space-between",
    },
    colorItem: {
        flex: 1,
        flexBasis: "40%",
        marginBottom: rpx(36),
    },
    colorBlockContainer: {
        width: rpx(76),
        height: rpx(50),
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "#ccc",
    },
    colorBlock: {
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 2,
    },
    colorItemBlockContainer: {
        marginTop: rpx(18),
        flexDirection: "row",
        alignItems: "center",
    },
    colorText: {
        marginLeft: rpx(8),
    },
    transparentBg: {
        position: "absolute",
        zIndex: -1,
        width: "100%",
        height: "100%",
        left: 0,
        top: 0,
    },
});
