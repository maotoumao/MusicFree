/**
 * 颜色选择器（form A）：饱和度/明度二维色域 + 色相条 + Alpha 条 + Hex 输入 + 实时预览
 * 高性能模型：hue/sat/val/alpha 四个 shared value 由 worklet 手势直改（UI 线程），预览与色域底色经 worklet HSV→RGB 上色；
 * 拖动全程零 colord，仅松手才提交（onChange + Alpha 底色）；渐变轨静态不重渲
 * Hex 回显是拖动中唯一过桥的东西：色值在 worklet 里就拼成字符串，JS 侧只有 HexField 这一个小组件重渲
 */
import { LinearGradient } from 'expo-linear-gradient';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
    GestureDetector,
    useExclusiveGestures,
    usePanGesture,
    useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
    useAnimatedReaction,
    useAnimatedStyle,
    useSharedValue,
    type SharedValue,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { elevation, layout, radius, space, useColors } from '@/design';
import { useT } from '@/i18n';
import { colord, hsvaToHex, hsvToRgb } from '@/utils/color';

interface Hsva {
    h: number;
    s: number;
    v: number;
    a: number;
}

/** 四个通道的一手引用：手势、动画样式与 Hex 回显共用同一组 */
interface Channels {
    hue: SharedValue<number>;
    sat: SharedValue<number>;
    val: SharedValue<number>;
    alpha: SharedValue<number>;
}

/** 解析颜色字符串 → HSVA（0–360 / 0–1）；无效返回 null */
function parseHsva(value: string): Hsva | null {
    const c = colord(value);
    if (!c.isValid()) {
        return null;
    }
    const { h, s, v } = c.toHsv();
    return { h, s: s / 100, v: v / 100, a: c.alpha() };
}

const clamp01 = (n: number) => {
    'worklet';
    return Math.max(0, Math.min(1, n));
};

/** 把拇指位移夹在轨道内（0..轨道长-拇指径），使空心圈端点贴边不悬出、圈内恒为轨道色 */
const clampPos = (pos: number, max: number) => {
    'worklet';
    return Math.max(0, Math.min(pos, max));
};

/**
 * 手势拖动/点按共用：pan（minDistance 0）+ tap 竞争
 * 松手在 worklet 内读 HSVA 快照作参数传 onCommit（原子、避开异步读串值）；
 * 仅真激活过的 pan 才在取消时回滚（iOS 静止点按会让 pan FAILED，不能误触发 cancel）
 */
function useTrackGesture(config: {
    channels: Channels;
    committed: SharedValue<Hsva>;
    opacityEnabled: SharedValue<boolean>;
    /** pan 真正在手上时为真；Hex 回显只在这段时间里认通道值 */
    dragging: SharedValue<boolean>;
    onSlide: (x: number, y: number) => void;
    onBegin: () => void;
    onCommit: (h: number, s: number, v: number, a: number) => void;
    onCancel: () => void;
}) {
    const {
        channels,
        committed,
        opacityEnabled,
        dragging,
        onSlide,
        onBegin,
        onCommit,
        onCancel,
    } = config;
    const { hue, sat, val, alpha } = channels;
    const activated = useSharedValue(false);
    const pan = usePanGesture(
        useMemo<NonNullable<Parameters<typeof usePanGesture>[0]>>(
            () => ({
                minDistance: 0,
                onActivate: e => {
                    'worklet';
                    activated.value = true;
                    dragging.value = true;
                    onSlide(e.x, e.y);
                    scheduleOnRN(onBegin);
                },
                onUpdate: e => {
                    'worklet';
                    onSlide(e.x, e.y);
                },
                onDeactivate: e => {
                    'worklet';
                    if (!e.canceled) {
                        const effectiveAlpha = opacityEnabled.value
                            ? alpha.value
                            : 1;
                        alpha.value = effectiveAlpha;
                        committed.value = {
                            h: hue.value,
                            s: sat.value,
                            v: val.value,
                            a: effectiveAlpha,
                        };
                        scheduleOnRN(
                            onCommit,
                            hue.value,
                            sat.value,
                            val.value,
                            effectiveAlpha,
                        );
                    }
                },
                onFinalize: e => {
                    'worklet';
                    // 取消：在 UI 线程原子回滚到 committed 快照，避开异步 JS 回写与下一手势竞态
                    if (e.canceled && activated.value) {
                        const snap = committed.value;
                        hue.value = snap.h;
                        sat.value = snap.s;
                        val.value = snap.v;
                        alpha.value = snap.a;
                        scheduleOnRN(onCancel);
                    }
                    activated.value = false;
                    dragging.value = false;
                },
            }),
            [
                activated,
                committed,
                dragging,
                hue,
                sat,
                val,
                alpha,
                opacityEnabled,
                onSlide,
                onBegin,
                onCommit,
                onCancel,
            ],
        ),
    );
    const tap = useTapGesture(
        useMemo<NonNullable<Parameters<typeof useTapGesture>[0]>>(
            () => ({
                maxDistance: 16,
                onActivate: e => {
                    'worklet';
                    onSlide(e.x, e.y);
                    const effectiveAlpha = opacityEnabled.value
                        ? alpha.value
                        : 1;
                    alpha.value = effectiveAlpha;
                    committed.value = {
                        h: hue.value,
                        s: sat.value,
                        v: val.value,
                        a: effectiveAlpha,
                    };
                    scheduleOnRN(onBegin);
                    scheduleOnRN(
                        onCommit,
                        hue.value,
                        sat.value,
                        val.value,
                        effectiveAlpha,
                    );
                },
            }),
            [
                committed,
                hue,
                sat,
                val,
                alpha,
                opacityEnabled,
                onSlide,
                onBegin,
                onCommit,
            ],
        ),
    );
    return useExclusiveGestures(pan, tap);
}

/** 透明度棋盘格背景（表示半透明）：静态、按测量尺寸铺白/灰方格 */
function Checkerboard({ tile = 8 }: { tile?: number }) {
    const [size, setSize] = useState({ w: 0, h: 0 });
    const squares = useMemo(() => {
        const cols = Math.ceil(size.w / tile);
        const rows = Math.ceil(size.h / tile);
        const out: ReactNode[] = [];
        for (let r = 0; r < rows; r++) {
            for (let col = 0; col < cols; col++) {
                if ((r + col) % 2 === 1) {
                    out.push(
                        <Rect
                            key={`${r}-${col}`}
                            x={col * tile}
                            y={r * tile}
                            width={tile}
                            height={tile}
                            fill="#c8c8c8"
                        />,
                    );
                }
            }
        }
        return out;
    }, [size, tile]);
    return (
        <View
            style={StyleSheet.absoluteFill}
            onLayout={(e: LayoutChangeEvent) =>
                setSize({
                    w: e.nativeEvent.layout.width,
                    h: e.nativeEvent.layout.height,
                })
            }
        >
            <Svg width="100%" height="100%">
                <Rect width="100%" height="100%" fill="#ffffff" />
                {squares}
            </Svg>
        </View>
    );
}

/**
 * Hex 输入框：拖动中跟手回显
 *
 * 单独成组件，而不是在 ColorPicker 里再加一个 state——拖动时每帧都要换文本，
 * 挂在 ColorPicker 上会连色域、三条渐变轨、棋盘格一起重渲。这里重渲的只有一个 Input。
 *
 * 文本有两个来源：已提交值（`text`，受控）与拖动实时值（`live`）。`live` 非空即接管。
 *
 * **只在 pan 真正在手上时才认通道值**，这是关键：通道是有损的。`parseHsva` 走 colord 的
 * `toHsv()`，而它把 h/s/v 取整，于是「hex → 通道 → hex」并不闭合（实测约 88% 的颜色会
 * 差 1/255）。手势期间通道是唯一真相，回读没问题；可一旦是 `applyHsva` 写的通道
 * （输入提交、外部改色、关掉透明度），真相在 `text` 那边，此时回读只会把用户刚打的
 * `#AC95F0` 显示成 `#AB95F0`——而且 `setHexText` 写回同一个字符串时 React 会跳过，
 * `[text]` 那条 effect 也就永远不来救场
 */
function HexField({
    channels,
    opacityEnabled,
    dragging,
    text,
    onChangeText,
    onSubmit,
    accessibilityLabel,
}: {
    channels: Channels;
    opacityEnabled: SharedValue<boolean>;
    dragging: SharedValue<boolean>;
    text: string;
    onChangeText: (text: string) => void;
    onSubmit: () => void;
    accessibilityLabel: string;
}) {
    const { hue, sat, val, alpha } = channels;
    const [live, setLive] = useState<string | null>(null);

    useAnimatedReaction(
        () =>
            dragging.value
                ? hsvaToHex(
                      hue.value,
                      sat.value,
                      val.value,
                      opacityEnabled.value ? alpha.value : 1,
                  ).toUpperCase()
                : null,
        (current, previous) => {
            if (current !== null && current !== previous) {
                scheduleOnRN(setLive, current);
            }
        },
    );

    // 手一松就交还受控文本。提交那条路 `text` 会变、本来就会交还，这里真正兜的是**取消**：
    // 通道在 UI 线程被回滚了，但没有任何提交发生，`text` 一动不动，只能靠这里把 live 清掉。
    // RNGH 保证 onEnd 先于 onFinalize，所以提交的 setHexText 排在这次清除之前，不会闪回旧值
    useAnimatedReaction(
        () => dragging.value,
        (isDragging, was) => {
            if (was === true && !isDragging) {
                scheduleOnRN(setLive, null);
            }
        },
    );

    useEffect(() => {
        setLive(null);
    }, [text]);

    const handleChangeText = useCallback(
        (next: string) => {
            // 用户开始打字：立刻交还受控文本，否则下一帧手势回显会把输入吞掉
            setLive(null);
            onChangeText(next);
        },
        [onChangeText],
    );

    return (
        <Input
            value={live ?? text}
            onChangeText={handleChangeText}
            onSubmitEditing={onSubmit}
            onBlur={onSubmit}
            autoCapitalize="characters"
            autoCorrect={false}
            size="md"
            style={styles.hexInput}
            accessibilityLabel={accessibilityLabel}
        />
    );
}

interface ColorPickerProps {
    /** 当前颜色（受控），hex；拖动中内部接管，忽略外部 value */
    value: string;
    /** 松手 / 点按 / Hex 提交时回调最终颜色（#RRGGBB 或 #RRGGBBAA） */
    onChange: (hex: string) => void;
    /** 是否显示并允许编辑透明度；默认 true，false 时所有输入按不透明色提交 */
    showOpacity?: boolean;
}

/**
 * 颜色选择器图元：纯 UI、无 core 依赖
 * value 变化经 colord 解析进四个 shared value；拖动只动 shared value，松手 hsvaToHex 提交
 */
function ColorPicker({
    value,
    onChange,
    showOpacity = true,
}: ColorPickerProps) {
    const colors = useColors();
    const t = useT();

    // 初始颜色只解析一次，直接初始化四个通道（避免首帧回落黑色再由 effect 纠正）
    const [initial] = useState(() => {
        const hsva = parseHsva(value);
        if (!hsva) {
            return { h: 0, s: 0, v: 0, a: 1, hex: '#000000' };
        }
        const alpha = showOpacity ? hsva.a : 1;
        return { ...hsva, a: alpha, hex: colord(value).alpha(alpha).toHex() };
    });

    const hue = useSharedValue(initial.h);
    const sat = useSharedValue(initial.s);
    const val = useSharedValue(initial.v);
    const alpha = useSharedValue(initial.a);
    const opacityEnabled = useSharedValue(showOpacity);
    // pan 是否在手上：Hex 回显据此判断通道值是不是当前真相（见 HexField）
    const dragging = useSharedValue(false);
    // 已提交的 HSVA 快照（含灰/黑保留的 hue/sat）：取消手势在 UI 线程原子回滚，避免异步 JS 回写
    const committed = useSharedValue<Hsva>({
        h: initial.h,
        s: initial.s,
        v: initial.v,
        a: initial.a,
    });

    const svW = useSharedValue(1);
    const svH = useSharedValue(1);
    const hueW = useSharedValue(1);
    const alphaW = useSharedValue(1);

    // onChange 走 latest-ref：commit 身份恒定，提交后不重建手势 config
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const draggingRef = useRef(false);
    // 最近一次提交的规范 hex：供自回声/去重比对 + Alpha 底色 + Hex 回填（始终最新）
    const committedRef = useRef(initial.hex);
    const [alphaBase, setAlphaBase] = useState(initial.hex);
    const [hexText, setHexText] = useState(initial.hex.toUpperCase());

    // 动态关闭透明度时立即归一化 UI 当前值与取消快照，不受正在拖动状态影响
    useEffect(() => {
        opacityEnabled.value = showOpacity;
        if (!showOpacity) {
            alpha.value = 1;
            committed.value = { ...committed.value, a: 1 };
            const opaque = colord(committedRef.current).alpha(1).toHex();
            committedRef.current = opaque;
            setAlphaBase(opaque);
            setHexText(opaque.toUpperCase());
        }
    }, [alpha, committed, opacityEnabled, showOpacity]);

    // 写四通道 + committed 快照；灰保留现有 hue、黑保留现有 hue/sat（其 hue/sat 无意义、免拇指跳变）
    const applyHsva = useCallback(
        (hsva: Hsva) => {
            const h = hsva.s > 1e-4 && hsva.v > 1e-4 ? hsva.h : hue.value;
            const s = hsva.v > 1e-4 ? hsva.s : sat.value;
            const a = showOpacity ? hsva.a : 1;
            hue.value = h;
            sat.value = s;
            val.value = hsva.v;
            alpha.value = a;
            committed.value = { h, s, v: hsva.v, a };
        },
        [hue, sat, val, alpha, committed, showOpacity],
    );

    // 外部 value → 四通道（未拖动时跟随）；按规范 hex 比对，自回声跳过重解析
    useEffect(() => {
        const hsva = parseHsva(value);
        if (!hsva) {
            return;
        }
        const normalized = showOpacity ? hsva : { ...hsva, a: 1 };
        const hex = colord(value).alpha(normalized.a).toHex();
        if (draggingRef.current || hex === committedRef.current) {
            return;
        }
        applyHsva(normalized);
        committedRef.current = hex;
        setAlphaBase(hex);
        setHexText(hex.toUpperCase());
    }, [value, applyHsva, showOpacity]);

    const begin = useCallback(() => {
        draggingRef.current = true;
    }, []);
    // 松手提交：committed 快照已由 worklet 在 UI 线程写好，这里只落 hex/回调（HSVA 由 worklet 原子传参）
    const commit = useCallback(
        (h: number, s: number, v: number, a: number) => {
            draggingRef.current = false;
            const hex = hsvaToHex(h, s, v, showOpacity ? a : 1);
            committedRef.current = hex;
            setAlphaBase(hex);
            setHexText(hex.toUpperCase());
            onChangeRef.current(hex);
        },
        [showOpacity],
    );
    // 取消回滚已由 worklet 在 UI 线程原子完成（读 committed 快照），这里只清拖动标记
    const cancel = useCallback(() => {
        draggingRef.current = false;
    }, []);

    const onSlideSv = useCallback(
        (x: number, y: number) => {
            'worklet';
            sat.value = clamp01(x / svW.value);
            val.value = clamp01(1 - y / svH.value);
        },
        [sat, val, svW, svH],
    );
    const onSlideHue = useCallback(
        (x: number) => {
            'worklet';
            hue.value = clamp01(x / hueW.value) * 360;
        },
        [hue, hueW],
    );
    const onSlideAlpha = useCallback(
        (x: number) => {
            'worklet';
            alpha.value = opacityEnabled.value ? clamp01(x / alphaW.value) : 1;
        },
        [alpha, alphaW, opacityEnabled],
    );

    const channels = { hue, sat, val, alpha };
    const svGesture = useTrackGesture({
        channels,
        committed,
        opacityEnabled,
        dragging,
        onSlide: onSlideSv,
        onBegin: begin,
        onCommit: commit,
        onCancel: cancel,
    });
    const hueGesture = useTrackGesture({
        channels,
        committed,
        opacityEnabled,
        dragging,
        onSlide: onSlideHue,
        onBegin: begin,
        onCommit: commit,
        onCancel: cancel,
    });
    const alphaGesture = useTrackGesture({
        channels,
        committed,
        opacityEnabled,
        dragging,
        onSlide: onSlideAlpha,
        onBegin: begin,
        onCommit: commit,
        onCancel: cancel,
    });

    const previewStyle = useAnimatedStyle(() => {
        const { r, g, b } = hsvToRgb(hue.value, sat.value, val.value);
        const effectiveAlpha = opacityEnabled.value ? alpha.value : 1;
        return {
            backgroundColor: `rgba(${r}, ${g}, ${b}, ${effectiveAlpha})`,
        };
    });
    const svBaseStyle = useAnimatedStyle(() => {
        const { r, g, b } = hsvToRgb(hue.value, 1, 1);
        return { backgroundColor: `rgb(${r}, ${g}, ${b})` };
    });
    const svThumbStyle = useAnimatedStyle(() => ({
        transform: [
            {
                translateX: clampPos(
                    sat.value * svW.value - THUMB / 2,
                    svW.value - THUMB,
                ),
            },
            {
                translateY: clampPos(
                    (1 - val.value) * svH.value - THUMB / 2,
                    svH.value - THUMB,
                ),
            },
        ],
    }));
    const hueThumbStyle = useAnimatedStyle(() => ({
        transform: [
            {
                translateX: clampPos(
                    (hue.value / 360) * hueW.value - THUMB / 2,
                    hueW.value - THUMB,
                ),
            },
        ],
    }));
    const alphaThumbStyle = useAnimatedStyle(() => ({
        transform: [
            {
                translateX: clampPos(
                    alpha.value * alphaW.value - THUMB / 2,
                    alphaW.value - THUMB,
                ),
            },
        ],
    }));

    // 回车/失焦提交：RN0.86 blurAndSubmit 会连触两次，按规范 hex 与 committedRef 去重
    const onSubmitHex = useCallback(() => {
        const hsva = parseHsva(hexText);
        if (!hsva) {
            setHexText(committedRef.current.toUpperCase());
            return;
        }
        const normalized = showOpacity ? hsva : { ...hsva, a: 1 };
        const hex = colord(hexText).alpha(normalized.a).toHex();
        if (hex === committedRef.current) {
            setHexText(hex.toUpperCase());
            return;
        }
        applyHsva(normalized);
        committedRef.current = hex;
        setAlphaBase(hex);
        setHexText(hex.toUpperCase());
        onChangeRef.current(hex);
    }, [hexText, applyHsva, showOpacity]);

    const alphaFrom = colord(alphaBase).alpha(0).toRgbString();
    const alphaTo = colord(alphaBase).alpha(1).toRgbString();

    return (
        <View>
            <View style={styles.valueRow}>
                <Text color="textSecondary">{t('colorPicker.hex')}</Text>
                <HexField
                    channels={channels}
                    opacityEnabled={opacityEnabled}
                    dragging={dragging}
                    text={hexText}
                    onChangeText={setHexText}
                    onSubmit={onSubmitHex}
                    accessibilityLabel={t('colorPicker.a11y.hexValue')}
                />
                <View
                    style={[
                        styles.previewSwatch,
                        { borderColor: colors.border },
                    ]}
                    accessible
                    accessibilityLabel={t('colorPicker.a11y.preview')}
                >
                    <Checkerboard />
                    <Animated.View
                        style={[StyleSheet.absoluteFill, previewStyle]}
                    />
                </View>
            </View>

            <GestureDetector gesture={svGesture}>
                <View
                    style={styles.sv}
                    onLayout={(e: LayoutChangeEvent) => {
                        svW.value = e.nativeEvent.layout.width;
                        svH.value = e.nativeEvent.layout.height;
                    }}
                >
                    <Animated.View
                        style={[StyleSheet.absoluteFill, svBaseStyle]}
                    />
                    <LinearGradient
                        colors={['#ffffff', 'rgba(255,255,255,0)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <LinearGradient
                        colors={['rgba(0,0,0,0)', '#000000']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <Animated.View
                        style={[
                            styles.thumb,
                            { shadowColor: colors.shadow },
                            svThumbStyle,
                        ]}
                    />
                </View>
            </GestureDetector>

            <View style={styles.barsGroup}>
                <View style={styles.barRow}>
                    <Text
                        style={styles.barLabel}
                        color="textSecondary"
                        size="sm"
                    >
                        {t('colorPicker.hue')}
                    </Text>
                    <GestureDetector gesture={hueGesture}>
                        <View
                            style={styles.barHit}
                            onLayout={(e: LayoutChangeEvent) => {
                                hueW.value = e.nativeEvent.layout.width;
                            }}
                        >
                            <View style={styles.bar}>
                                <LinearGradient
                                    colors={[
                                        '#ff0000',
                                        '#ffff00',
                                        '#00ff00',
                                        '#00ffff',
                                        '#0000ff',
                                        '#ff00ff',
                                        '#ff0000',
                                    ]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={StyleSheet.absoluteFill}
                                />
                            </View>
                            <Animated.View
                                style={[
                                    styles.barThumb,
                                    { shadowColor: colors.shadow },
                                    hueThumbStyle,
                                ]}
                            />
                        </View>
                    </GestureDetector>
                </View>
                {showOpacity ? (
                    <View style={styles.barRow}>
                        <Text
                            style={styles.barLabel}
                            color="textSecondary"
                            size="sm"
                        >
                            {t('colorPicker.alpha')}
                        </Text>
                        <GestureDetector gesture={alphaGesture}>
                            <View
                                style={styles.barHit}
                                onLayout={(e: LayoutChangeEvent) => {
                                    alphaW.value = e.nativeEvent.layout.width;
                                }}
                            >
                                <View style={styles.bar}>
                                    <Checkerboard />
                                    <LinearGradient
                                        colors={[alphaFrom, alphaTo]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={StyleSheet.absoluteFill}
                                    />
                                </View>
                                <Animated.View
                                    style={[
                                        styles.barThumb,
                                        { shadowColor: colors.shadow },
                                        alphaThumbStyle,
                                    ]}
                                />
                            </View>
                        </GestureDetector>
                    </View>
                ) : null}
            </View>
        </View>
    );
}

const THUMB = 18;

const styles = StyleSheet.create({
    valueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
    },
    previewSwatch: {
        width: 40,
        height: 40,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    sv: {
        height: 180,
        borderRadius: radius.md,
        overflow: 'hidden',
        marginTop: space.lg,
    },
    // 条组：与 SV 拉开较大间距；组内两条贴近（视觉间距仅剩命中区留白），与「SV→条」形成层次
    barsGroup: {
        marginTop: space.xl,
    },
    barRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
    },
    barLabel: {
        width: 48,
    },
    barHit: {
        flex: 1,
        height: layout.hitTarget,
        justifyContent: 'center',
    },
    bar: {
        height: 24,
        borderRadius: radius.full,
        overflow: 'hidden',
    },
    thumb: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: THUMB,
        height: THUMB,
        borderRadius: THUMB / 2,
        borderWidth: 2,
        borderColor: '#ffffff',
        ...elevation.sm,
    },
    barThumb: {
        position: 'absolute',
        top: (layout.hitTarget - THUMB) / 2,
        left: 0,
        width: THUMB,
        height: THUMB,
        borderRadius: THUMB / 2,
        borderWidth: 2,
        borderColor: '#ffffff',
        ...elevation.sm,
    },
    hexInput: {
        flex: 1,
    },
});

export { ColorPicker };
export type { ColorPickerProps };
