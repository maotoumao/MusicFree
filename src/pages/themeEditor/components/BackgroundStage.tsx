import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Image } from '@/components/ui/Image';
import { useColors } from '@/design';
import { useT } from '@/i18n';
import { BAKE_BACKDROP_COLOR } from '@/infra/bakeCoverBitmap';

import type { BackgroundShape } from '../hooks/useBackgroundEditor';

interface BackgroundStageProps {
    /** 背景原图；未设背景时为 undefined，只接手势不画图 */
    sourceUri: string | undefined;
    /** 已落库的形状参数：手势与滑块的起点 */
    shape: BackgroundShape;
    /** 缩放实时值，由滑块在拖动中直写 */
    liveScale: SharedValue<number>;
    /** 幕布不透明度实时值 = 1 - 背景可见度 */
    liveVeil: SharedValue<number>;
    /**
     * 进行中的交互计数：只有 > 0 时才盖上预览层，静止时直接看已烘焙的真背景
     * 用计数而非布尔——拖动画布与拖滑块可以同时发生，布尔会被先结束的那一路清掉
     */
    activeInteractions: SharedValue<number>;
    /** 手势结束到 busy 变真之间的接力标记，同样让预览层保持可见 */
    pendingCommit: SharedValue<number>;
    /** 拖动结束后提交新的焦点 */
    onMoveEnd(focusX: number, focusY: number): void;
    /** 烘焙中：暂停手势，且预览层继续盖着——新位图落库前底下还是上一次的取景 */
    busy: boolean;
}

/**
 * 编辑期的实时预览层：拖动时盖在真背景之上，按原图 + 当前形状即时跟手
 *
 * 只在交互期间显示，静止态让位给 `Screen` 铺的已烘焙位图——那才是最终效果。
 * 不用 Skia：RN Skia 的 `useImage` 内部从不释放解码位图与编码字节，
 * 拿它承载用户相册原图会随进出编辑器线性泄漏；`expo-image` 自带缓存与回收。
 *
 * 预览**不加模糊**：`expo-image` 的模糊是解码期 transformation，按值分裂缓存键，
 * 每换一档就多一份全分辨率位图（正是弃用 Skia 想避开的内存问题）；而且它作用在缩放之前，
 * 预览的模糊会跟着放大倍数一起放大、烘焙的不会，越放大越误导。
 * 于是拖动期间看到的是清晰原图（定位反而更准），松手烘焙后才是最终观感。
 */
function BackgroundStage({
    sourceUri,
    shape,
    liveScale,
    liveVeil,
    activeInteractions,
    pendingCommit,
    onMoveEnd,
    busy,
}: BackgroundStageProps) {
    const colors = useColors();
    const t = useT();
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [intrinsic, setIntrinsic] = useState({ width: 0, height: 0 });

    const focusX = useSharedValue(shape.focusX);
    const focusY = useSharedValue(shape.focusY);
    // 手势按下瞬间的焦点，用于把位移换算成焦点增量
    const startFocusX = useSharedValue(shape.focusX);
    const startFocusY = useSharedValue(shape.focusY);
    // 渲染期写 shared value 会与并发渲染打架，落到 effect 里
    // busy 是守卫不是依赖：烘焙期间回灌会把刚拖好的取景打回旧值（预览正盖着，用户直接看得见）；
    // 依赖里仍留着它，好让烘焙失败时的 true→false 触发一次复位，把被丢弃的拖动值收回去
    useEffect(() => {
        if (busy) {
            return;
        }
        focusX.value = shape.focusX;
        focusY.value = shape.focusY;
    }, [busy, focusX, focusY, shape.focusX, shape.focusY]);
    // 卸载时收起预览层：不复位会让它带着过时的实时值永久盖住真背景
    useEffect(
        () => () => {
            activeInteractions.value = 0;
            pendingCommit.value = 0;
        },
        [activeInteractions, pendingCommit],
    );
    // 换图后原图尺寸要重测，否则会拿旧图的比例算取景
    useEffect(() => {
        setIntrinsic({ width: 0, height: 0 });
    }, [sourceUri]);

    const ready =
        sourceUri !== undefined &&
        size.width > 0 &&
        size.height > 0 &&
        intrinsic.width > 0 &&
        intrinsic.height > 0;
    // 恰好铺满画布的基准尺寸；用户缩放在其上再乘
    const cover = ready
        ? Math.max(size.width / intrinsic.width, size.height / intrinsic.height)
        : 1;
    const baseWidth = intrinsic.width * cover;
    const baseHeight = intrinsic.height * cover;

    const imageStyle = useAnimatedStyle(() => {
        if (!ready) {
            // 必须显式给单位变换：Reanimated 的 updater 只遍历新对象里出现的键，
            // 返回 {} 不会撤销上一次下发的 transform——换图时旧的缩放平移会留在原生 View 上，
            // 叠在退化的 cover 铺满上就是一次明显的偏移 + 过度放大
            return {
                transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }],
            };
        }
        const scale = liveScale.value;
        // 变换绕自身中心，先算出缩放后本该落在的左上角，再折算成位移
        const overflowX = baseWidth * scale - size.width;
        const overflowY = baseHeight * scale - size.height;
        return {
            transform: [
                {
                    translateX:
                        -overflowX * focusX.value -
                        (baseWidth * (1 - scale)) / 2,
                },
                {
                    translateY:
                        -overflowY * focusY.value -
                        (baseHeight * (1 - scale)) / 2,
                },
                { scale },
            ],
        };
    }, [baseHeight, baseWidth, ready, size.height, size.width]);
    const overlayStyle = useAnimatedStyle(
        () => ({
            opacity:
                activeInteractions.value > 0 || pendingCommit.value > 0 || busy
                    ? 1
                    : 0,
        }),
        [busy],
    );
    const veilStyle = useAnimatedStyle(() => ({ opacity: liveVeil.value }));

    const pan = usePanGesture(
        useMemo<NonNullable<Parameters<typeof usePanGesture>[0]>>(
            () => ({
                enabled: ready && !busy,
                minDistance: 4,
                onActivate: () => {
                    'worklet';
                    startFocusX.value = focusX.value;
                    startFocusY.value = focusY.value;
                    activeInteractions.value += 1;
                },
                onUpdate: event => {
                    'worklet';
                    // 焦点是「被裁掉的溢出量」的比例，位移要按溢出量换算
                    const scale = liveScale.value;
                    const overflowX = baseWidth * scale - size.width;
                    const overflowY = baseHeight * scale - size.height;
                    focusX.value =
                        overflowX > 0
                            ? clamp(
                                  startFocusX.value -
                                      event.translationX / overflowX,
                              )
                            : 0.5;
                    focusY.value =
                        overflowY > 0
                            ? clamp(
                                  startFocusY.value -
                                      event.translationY / overflowY,
                              )
                            : 0.5;
                },
                onDeactivate: event => {
                    'worklet';
                    // 提交路径先立起接力标记，再释放计数：两者不能同时为 0
                    if (!event.canceled) {
                        pendingCommit.value = 1;
                    }
                    if (event.canceled) {
                        // 取消不提交，core 的焦点没变，同步 effect 也不会重跑；
                        // 就地复位成按下时的基线，免得脏值成为下次拖动的起点
                        focusX.value = startFocusX.value;
                        focusY.value = startFocusY.value;
                        activeInteractions.value = Math.max(
                            0,
                            activeInteractions.value - 1,
                        );
                        return;
                    }
                    activeInteractions.value = Math.max(
                        0,
                        activeInteractions.value - 1,
                    );
                    scheduleOnRN(onMoveEnd, focusX.value, focusY.value);
                },
            }),
            [
                activeInteractions,
                baseHeight,
                baseWidth,
                busy,
                focusX,
                focusY,
                liveScale,
                onMoveEnd,
                pendingCommit,
                ready,
                size.height,
                size.width,
                startFocusX,
                startFocusY,
            ],
        ),
    );

    const onLayout = (event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        setSize({ width: Math.round(width), height: Math.round(height) });
    };

    return (
        <GestureDetector gesture={pan}>
            <View
                style={StyleSheet.absoluteFill}
                onLayout={onLayout}
                accessibilityLabel={t('themeEditor.a11y.backgroundStage')}
            >
                {sourceUri !== undefined ? (
                    <Animated.View
                        pointerEvents="none"
                        style={[styles.overlay, overlayStyle]}
                    >
                        {/* 与烘焙同一个底：带透明区的源图否则会透出旧背景，且与最终结果不符。
                            未就绪时不铺——`busy` 也会让预览层显形，那时铺白底就是整屏白闪 */}
                        {ready ? (
                            <View
                                style={[
                                    styles.fill,
                                    { backgroundColor: BAKE_BACKDROP_COLOR },
                                ]}
                            />
                        ) : null}
                        {/* 尺寸未知时先给盒子铺满画布：Android 的 expo-image 在 0×0 的父盒里
                            根本不会发起加载（`getTargetDimen` 直接返回 PENDING），而盒子尺寸又
                            要等 onLoad 才算得出来——不给回退值就是死锁，拖动定位整个失效 */}
                        <Animated.View
                            style={[
                                ready
                                    ? { width: baseWidth, height: baseHeight }
                                    : styles.fill,
                                styles.image,
                                imageStyle,
                            ]}
                        >
                            <Image
                                source={sourceUri}
                                style={styles.fill}
                                contentFit={ready ? 'fill' : 'cover'}
                                transition={0}
                                onLoad={event =>
                                    setIntrinsic({
                                        width: event.source.width,
                                        height: event.source.height,
                                    })
                                }
                            />
                        </Animated.View>
                        <Animated.View
                            style={[
                                styles.fill,
                                { backgroundColor: colors.background },
                                veilStyle,
                            ]}
                        />
                    </Animated.View>
                ) : null}
            </View>
        </GestureDetector>
    );
}

function clamp(value: number): number {
    'worklet';
    return Math.max(0, Math.min(1, value));
}

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        overflow: 'hidden',
    },
    image: {
        position: 'absolute',
        top: 0,
        left: 0,
    },
    fill: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
    },
});

export { BackgroundStage };
