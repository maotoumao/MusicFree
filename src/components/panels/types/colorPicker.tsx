import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import PanelBase from "../base/panelBase";
import LinearGradient from "react-native-linear-gradient";
import Color from "color";
import { Gesture, GestureDetector, TextInput } from "react-native-gesture-handler";
import { hidePanel } from "../usePanel";
import { ImgAsset } from "@/constants/assetsConst";
import PanelHeader from "../base/panelHeader";
import { useI18N } from "@/core/i18n";

interface IColorPickerProps {
    defaultColor?: string;
    onSelected?: (color: Color) => void;
    closePanelWhenSelected?: boolean;
}

const areaSize = rpx(420);

export default function ColorPicker(props: IColorPickerProps) {
    const {
        onSelected,
        defaultColor = "#66ccff",
        closePanelWhenSelected = true,
    } = props;

    const { t } = useI18N();

    const [currentHue, setCurrentHue] = useState(Color(defaultColor).hue());
    const [currentSaturation, setCurrentSaturation] = useState(
        Color(defaultColor).saturationl(),
    );
    const [currentLightness, setCurrentLightness] = useState(
        Color(defaultColor).lightness(),
    );
    const [currentAlpha, setCurrentAlpha] = useState(
        Color(defaultColor).alpha(),
    );

    const [inputValue, setInputValue] = useState(() =>
        Color(defaultColor).rgb().hexa().toString()
    );

    const hueColor = useMemo(
        () => Color.hsl(currentHue, 100, 50),
        [currentHue]
    );

    const currentColor = useMemo(
        () => Color.hsl(currentHue, currentSaturation, currentLightness),
        [currentHue, currentSaturation, currentLightness],
    );

    const currentColorWithAlpha = useMemo(
        () => currentColor.alpha(currentAlpha),
        [currentColor, currentAlpha],
    );

    const hueColorString = useMemo(() => hueColor.toString(), [hueColor]);
    const currentColorString = useMemo(() => currentColor.toString(), [currentColor]);
    const currentColorWithAlphaString = useMemo(() => currentColorWithAlpha.toString(), [currentColorWithAlpha]);
    const currentColorAlpha0String = useMemo(() => currentColor.alpha(0).toString(), [currentColor]);
    const colorHexString = useMemo(() => currentColorWithAlpha.rgb().hexa().toString(), [currentColorWithAlpha]);

    // 同步colorHexString到inputValue
    const syncInputValue = useCallback(() => {
        setInputValue(colorHexString);
    }, [colorHexString]);

    // 当颜色通过滑块改变时，同步输入框
    useEffect(() => {
        syncInputValue();
    }, [syncInputValue]);

    const slThumbStyle = useMemo(() => ({
        left: -rpx(15) + (currentSaturation / 100) * areaSize,
        bottom: -rpx(15) + (currentLightness / 100) * areaSize,
        backgroundColor: currentColorString,
    }), [currentSaturation, currentLightness, currentColorString]);

    const hueThumbStyle = useMemo(() => ({
        top: -rpx(7) + (currentHue / 360) * areaSize,
    }), [currentHue]);

    const alphaThumbStyle = useMemo(() => ({
        top: -rpx(7) + (1 - currentAlpha) * areaSize,
    }), [currentAlpha]);

    const handleSLUpdate = useCallback((x: number, y: number) => {
        const xRate = Math.min(1, Math.max(0, x / areaSize));
        const yRate = Math.min(1, Math.max(0, y / areaSize));
        setCurrentSaturation(xRate * 100);
        setCurrentLightness((1 - yRate) * 100);
    }, []);

    const handleHueUpdate = useCallback((y: number) => {
        const yRate = Math.min(1, Math.max(0, y / areaSize));
        setCurrentHue(yRate * 360);
    }, []);

    const handleAlphaUpdate = useCallback((y: number) => {
        const yRate = Math.min(1, Math.max(0, y / areaSize));
        setCurrentAlpha(1 - yRate);
    }, []);

    const slTap = Gesture.Tap()
        .onStart(event => {
            const { x, y } = event;
            handleSLUpdate(x, y);
        })
        .runOnJS(true);

    const lastTimestampRef = useRef(Date.now());
    const slPan = Gesture.Pan()
        .onUpdate(event => {
            const newTimeStamp = Date.now();
            if (newTimeStamp - lastTimestampRef.current > 32) {
                lastTimestampRef.current = newTimeStamp;
                const { x, y } = event;
                handleSLUpdate(x, y);
            }
        })
        .runOnJS(true);

    const slComposed = Gesture.Race(slTap, slPan);

    const hueTap = Gesture.Tap()
        .onStart(event => {
            const { y } = event;
            handleHueUpdate(y);
        })
        .runOnJS(true);

    const huePan = Gesture.Pan()
        .onUpdate(event => {
            const { y } = event;
            handleHueUpdate(y);
        })
        .runOnJS(true);

    const hueComposed = Gesture.Race(hueTap, huePan);

    const alphaTap = Gesture.Tap()
        .onStart(event => {
            const { y } = event;
            handleAlphaUpdate(y);
        })
        .runOnJS(true);

    const alphaPan = Gesture.Pan()
        .onUpdate(event => {
            const { y } = event;
            handleAlphaUpdate(y);
        })
        .runOnJS(true);

    const alphaComposed = Gesture.Race(alphaTap, alphaPan);

    const handleColorInputChange = useCallback((text: string) => {
        setInputValue(text);
    }, []);

    const handleColorInputSubmit = useCallback(() => {
        try {
            const color = Color(inputValue);
            const hsl = color.hsl();

            setCurrentHue(hsl.hue() || 0);
            setCurrentSaturation(hsl.saturationl());
            setCurrentLightness(hsl.lightness());
            setCurrentAlpha(color.alpha());
        } catch (error) {
            // 如果输入的颜色无效，恢复到当前颜色
            setInputValue(colorHexString);
        }
    }, [inputValue, colorHexString]);

    const handleColorInputBlur = useCallback(() => {
        handleColorInputSubmit();
    }, [handleColorInputSubmit]);

    return (
        <PanelBase
            height={rpx(750)}
            keyboardAvoidBehavior="height"
            renderBody={() => (
                <>
                    <PanelHeader
                        onCancel={hidePanel}
                        onOk={async () => {
                            // 检查输入框的值是否与当前颜色不同
                            if (inputValue !== colorHexString) {
                                try {
                                    const color = Color(inputValue);
                                    const hsl = color.hsl();
                                    
                                    // 更新颜色状态
                                    setCurrentHue(hsl.hue() || 0);
                                    setCurrentSaturation(hsl.saturationl());
                                    setCurrentLightness(hsl.lightness());
                                    setCurrentAlpha(color.alpha());
                                    
                                    // 使用输入的颜色进行提交
                                    onSelected?.(color);
                                } catch (error) {
                                    // 如果输入的颜色无效，使用当前颜色
                                    onSelected?.(currentColorWithAlpha);
                                }
                            } else {
                                // 输入值与当前颜色相同，直接使用当前颜色
                                onSelected?.(currentColorWithAlpha);
                            }
                            
                            if (closePanelWhenSelected) {
                                hidePanel();
                            }
                        }}
                        title={t("panel.colorPicker.title")}
                    />

                    <View style={styles.container}>
                        <GestureDetector gesture={slComposed}>
                            <View
                                style={[
                                    styles.slContainer,
                                    {
                                        backgroundColor: hueColorString,
                                    },
                                ]}>
                                <LinearGradient
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    colors={["#808080", "rgba(0,0,0,0)"]}
                                    style={[styles.slContainer, styles.layer1]}
                                />
                                <LinearGradient
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 0, y: 1 }}
                                    colors={["#fff", "rgba(0,0,0,0)", "#000"]}
                                    style={[styles.slContainer, styles.layer2]}
                                />
                                <View
                                    style={[
                                        styles.slThumb,
                                        slThumbStyle,
                                    ]}
                                />
                            </View>
                        </GestureDetector>
                        <GestureDetector gesture={hueComposed}>
                            <LinearGradient
                                start={{
                                    x: 0,
                                    y: 0,
                                }}
                                end={{
                                    x: 0,
                                    y: 1,
                                }}
                                colors={[
                                    "#f00",
                                    "#ff0",
                                    "#0f0",
                                    "#0ff",
                                    "#00f",
                                    "#f0f",
                                    "#f00",
                                ]}
                                style={styles.hueContainer}>
                                <View
                                    style={[
                                        styles.hueThumb,
                                        hueThumbStyle,
                                    ]}
                                />
                            </LinearGradient>
                        </GestureDetector>
                        <GestureDetector gesture={alphaComposed}>
                            <LinearGradient
                                start={{
                                    x: 0,
                                    y: 0,
                                }}
                                end={{
                                    x: 0,
                                    y: 1,
                                }}
                                colors={[
                                    currentColorString,
                                    currentColorAlpha0String,
                                ]}
                                style={[
                                    styles.hueContainer,
                                    styles.alphaContainer,
                                ]}>
                                <View
                                    style={[
                                        styles.hueThumb,
                                        alphaThumbStyle,
                                    ]}
                                />
                                <Image
                                    resizeMode="repeat"
                                    source={ImgAsset.transparentBg}
                                    style={styles.transparentBg}
                                />
                            </LinearGradient>
                        </GestureDetector>
                    </View>
                    <View style={styles.showArea}>
                        <View style={[styles.showBar]}>
                            <Image
                                resizeMode="repeat"
                                source={ImgAsset.transparentBg}
                                style={styles.transparentBg}
                            />
                            <View
                                style={[
                                    styles.showBarContent,
                                    {
                                        backgroundColor: currentColorWithAlphaString,
                                    },
                                ]}
                            />
                        </View>
                        <TextInput
                            style={styles.colorInput}
                            value={inputValue}
                            onChangeText={handleColorInputChange}
                            onSubmitEditing={handleColorInputSubmit}
                            onBlur={handleColorInputBlur}
                            placeholder="#RRGGBBAA"
                            placeholderTextColor="#999"
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="done"
                        />
                    </View>
                </>
            )}
        />
    );
}

const styles = StyleSheet.create({
    opeartions: {
        width: "100%",
        paddingHorizontal: rpx(36),
        flexDirection: "row",
        height: rpx(100),
        alignItems: "center",
        justifyContent: "space-between",
    },
    container: {
        width: "100%",
        paddingHorizontal: rpx(48),
        paddingTop: rpx(36),
        flexDirection: "row",
    },
    slContainer: {
        width: areaSize,
        height: areaSize,
    },
    layer1: {
        position: "absolute",
        zIndex: 1,
        left: 0,
        top: 0,
    },
    layer2: {
        position: "absolute",
        zIndex: 2,
        left: 0,
        top: 0,
    },
    hueContainer: {
        width: rpx(48),
        height: areaSize,
        marginLeft: rpx(90),
    },
    alphaContainer: {
        marginLeft: rpx(48),
    },
    slThumb: {
        position: "absolute",
        width: rpx(24),
        height: rpx(24),
        borderRadius: rpx(12),
        borderWidth: rpx(3),
        borderStyle: "solid",
        borderColor: "#ccc",
        zIndex: 3,
    },
    hueThumb: {
        position: "absolute",
        width: rpx(56),
        height: rpx(8),
        left: -rpx(4),
        top: 0,
        borderWidth: rpx(3),
        borderStyle: "solid",
        borderColor: "#ccc",
    },
    showBar: {
        width: rpx(76),
        height: rpx(50),
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "#ccc",
    },
    showBarContent: {
        width: "100%",
        height: "100%",
        position: "absolute",
        left: 0,
        top: 0,
    },
    showArea: {
        width: "100%",
        marginTop: rpx(36),
        paddingHorizontal: rpx(48),
        flexDirection: "row",
        alignItems: "center",
    },
    colorStr: {
        marginLeft: rpx(24),
    },
    transparentBg: {
        position: "absolute",
        zIndex: -1,
        width: "100%",
        height: "100%",
        left: 0,
        top: 0,
    },
    colorInput: {
        marginLeft: rpx(24),
        minWidth: rpx(150),
        height: rpx(40),
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: rpx(4),
        paddingHorizontal: rpx(12),
        paddingVertical: 0,
        fontSize: rpx(28),
        color: "#333",
        backgroundColor: "#fff",
    },
});
