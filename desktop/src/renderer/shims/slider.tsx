/**
 * @react-native-community/slider 桌面端实现
 * 原生 input[type=range] + CSS 定制外观,保持 RN Slider 事件语义:
 *  - onValueChange: 拖动/点击过程中持续触发
 *  - onSlidingStart: 按下时触发
 *  - onSlidingComplete: 松手时触发
 * 拖动期间保持内部值,不受外部 value prop 更新打断。
 */
import React, { useEffect, useRef } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

const STYLE_ID = "mf-slider-style";

function ensureSliderStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.mf-slider {
    -webkit-appearance: none;
    appearance: none;
    position: absolute;
    left: 0; top: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    background: transparent;
    cursor: pointer;
    outline: none;
}
.mf-slider:focus { outline: none; }
.mf-slider::-webkit-slider-runnable-track {
    height: var(--mf-track-h, 4px);
    border-radius: 2px;
    background: linear-gradient(to right,
        var(--mf-min-color, #cccccc) 0%,
        var(--mf-min-color, #cccccc) var(--mf-pct, 0%),
        var(--mf-max-color, #999999) var(--mf-pct, 0%),
        var(--mf-max-color, #999999) 100%);
}
.mf-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: var(--mf-thumb-size, 14px);
    height: var(--mf-thumb-size, 14px);
    border-radius: 50%;
    background: var(--mf-thumb-color, #dddddd);
    margin-top: calc((var(--mf-thumb-size, 14px) - var(--mf-track-h, 4px)) / -2);
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.mf-slider::-moz-range-track {
    height: var(--mf-track-h, 4px);
    border-radius: 2px;
    background: var(--mf-max-color, #999999);
}
.mf-slider::-moz-range-progress {
    height: var(--mf-track-h, 4px);
    border-radius: 2px;
    background: var(--mf-min-color, #cccccc);
}
.mf-slider::-moz-range-thumb {
    width: var(--mf-thumb-size, 14px);
    height: var(--mf-thumb-size, 14px);
    border: none;
    border-radius: 50%;
    background: var(--mf-thumb-color, #dddddd);
}
.mf-slider:disabled { opacity: 0.4; cursor: default; }
`;
    document.head.appendChild(style);
}

interface SliderProps {
    style?: ViewStyle | ViewStyle[];
    value?: number;
    minimumValue?: number;
    maximumValue?: number;
    step?: number;
    disabled?: boolean;
    minimumTrackTintColor?: string;
    maximumTrackTintColor?: string;
    thumbTintColor?: string;
    onValueChange?: (value: number) => void;
    onSlidingStart?: (value: number) => void;
    onSlidingComplete?: (value: number) => void;
    testID?: string;
}

function Slider(props: SliderProps, ref: any) {
    const {
        style,
        value,
        minimumValue = 0,
        maximumValue = 1,
        step = 0.0001,
        disabled,
        minimumTrackTintColor,
        maximumTrackTintColor,
        thumbTintColor,
        onValueChange,
        onSlidingStart,
        onSlidingComplete,
    } = props;

    const inputRef = useRef<HTMLInputElement | null>(null);
    const draggingRef = useRef(false);

    ensureSliderStyle();

    // 非受控 + 手动同步:拖动期间不被外部 value 更新打断
    useEffect(() => {
        const el = inputRef.current;
        if (!el || draggingRef.current) return;
        const clamped = Math.min(Math.max(value ?? minimumValue, minimumValue), maximumValue);
        el.value = String(clamped);
        updatePct(el);
    }, [value, minimumValue, maximumValue]);

    const updatePct = (el: HTMLInputElement) => {
        const v = Number(el.value);
        const pct = maximumValue === minimumValue ? 0 : ((v - minimumValue) / (maximumValue - minimumValue)) * 100;
        el.style.setProperty("--mf-pct", `${pct}%`);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = Number(e.target.value);
        updatePct(e.target);
        onValueChange?.(v);
    };

    const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
        updatePct(e.target as HTMLInputElement);
        onValueChange?.(Number((e.target as HTMLInputElement).value));
    };

    const handleStart = (e: React.PointerEvent<HTMLInputElement>) => {
        draggingRef.current = true;
        onSlidingStart?.(Number((e.target as HTMLInputElement).value));
    };

    const handleEnd = (e: React.PointerEvent<HTMLInputElement>) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        onSlidingComplete?.(Number((e.target as HTMLInputElement).value));
    };

    return (
        <View style={[styles.container, style as ViewStyle]}>
            <input
                ref={(el) => {
                    inputRef.current = el;
                    if (el) updatePct(el);
                }}
                type="range"
                className="mf-slider"
                min={minimumValue}
                max={maximumValue}
                step={step}
                defaultValue={value ?? minimumValue}
                disabled={disabled}
                onInput={handleInput}
                onChange={handleChange as any}
                onPointerDown={handleStart}
                onPointerUp={handleEnd}
                onPointerCancel={handleEnd}
                style={{
                    "--mf-min-color": minimumTrackTintColor ?? "#cccccc",
                    "--mf-max-color": maximumTrackTintColor ?? "#999999",
                    "--mf-thumb-color": thumbTintColor ?? "#dddddd",
                } as React.CSSProperties}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: "relative",
        height: 30,
    },
});

export default React.forwardRef(Slider) as any;
