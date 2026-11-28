/**
 * B-spike v2：真 <Paragraph>（系统字体自动回退中文/emoji + 单行省略号）+ 万行，验证真实文字渲染吞吐
 *
 * 最苛刻的测法：每帧对可见 slot **重建 paragraph**（无缓存）。若这样都顺，正式版用环形池
 * （只在行跨界时重建、每帧至多 1 个 slot）只会更轻——即验证了 B 的真实文字吞吐不是新瓶颈
 * 观察：①滚动顺不顺 ②中文/日/韩/emoji 显示对不对、长标题单行省略号 ③长时间猛滚有无卡顿/内存崩
 * 文字/位置全在 UI 线程（useDerivedValue 里 Skia.ParagraphBuilder 构建 + Group transform 平移）
 * 仅 __DEV__；验证后此屏可删
 */
import {
    Canvas,
    Group,
    Paragraph,
    Rect,
    Skia,
} from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import {
    StyleSheet,
    Text as RNText,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import Animated, {
    scrollTo,
    useAnimatedRef,
    useAnimatedScrollHandler,
    useDerivedValue,
    useFrameCallback,
    useSharedValue,
    type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const ITEM_HEIGHT = 64;
const COUNT = 10000;
const SPEEDS = [2000, 6000, 12000] as const;
const TITLE_COLOR = '#fcfcfc';
const SUB_COLOR = '#aaaaaa';

// 多样中/日/韩/英/emoji + 长短标题：压 shaping、字体回退、单行省略号
const TITLE_BANK = [
    '测试歌曲标题',
    '一首名字特别长的歌用来测试单行省略号截断到底好不好使的样子和表现',
    'デモソング（日本語）',
    'Plain English Song Title',
    '🎵 Emoji 混排标题 🔥🎸',
    '春天里的你我他',
    '한국어 노래 제목',
];

function titleForRow(row: number): string {
    'worklet';
    return `${row}. ${TITLE_BANK[row % TITLE_BANK.length]}`;
}
function subtitleForRow(row: number): string {
    'worklet';
    return `歌手${row % 500} · 专辑${row % 300} · 未知演唱者`;
}
function buildParagraph(text: string, color: string, size: number) {
    'worklet';
    return Skia.ParagraphBuilder.Make({ maxLines: 1, ellipsis: '…' })
        .pushStyle({ color: Skia.Color(color), fontSize: size })
        .addText(text)
        .pop()
        .build();
}

function RowSlot({
    slot,
    offsetY,
    width,
}: {
    slot: number;
    offsetY: SharedValue<number>;
    width: number;
}) {
    // 每帧按当前偏移算本 slot 承载的行，并重建 title/subtitle paragraph（最苛刻，无缓存）
    const titlePara = useDerivedValue(() =>
        buildParagraph(
            titleForRow(Math.floor(offsetY.value / ITEM_HEIGHT) + slot),
            TITLE_COLOR,
            15,
        ),
    );
    const subtitlePara = useDerivedValue(() =>
        buildParagraph(
            subtitleForRow(Math.floor(offsetY.value / ITEM_HEIGHT) + slot),
            SUB_COLOR,
            12,
        ),
    );
    const transform = useDerivedValue(() => {
        const first = Math.floor(offsetY.value / ITEM_HEIGHT);
        return [{ translateY: (first + slot) * ITEM_HEIGHT - offsetY.value }];
    });
    const bg = slot % 2 === 0 ? '#1b1b1b' : '#242424';
    return (
        <Group transform={transform}>
            <Rect
                x={0}
                y={0}
                width={width}
                height={ITEM_HEIGHT - 1}
                color={bg}
            />
            <Paragraph paragraph={titlePara} x={16} y={9} width={width - 32} />
            <Paragraph
                paragraph={subtitlePara}
                x={16}
                y={36}
                width={width - 32}
            />
        </Group>
    );
}

export default function SkiaListSpikeScreen() {
    const { width, height } = useWindowDimensions();
    const scrollRef = useAnimatedRef<Animated.ScrollView>();
    const offsetY = useSharedValue(0);
    const velocity = useSharedValue(0);
    const isAuto = useSharedValue(false);
    const [speed, setSpeed] = useState<number>(12000);

    const maxOffset = COUNT * ITEM_HEIGHT - height;
    const slotCount = Math.ceil(height / ITEM_HEIGHT) + 2;
    const slots = useMemo(
        () => Array.from({ length: slotCount }, (_, i) => i),
        [slotCount],
    );

    const onScroll = useAnimatedScrollHandler(event => {
        if (!isAuto.value) {
            offsetY.value = event.contentOffset.y;
        }
    });

    const auto = useFrameCallback(frame => {
        'worklet';
        if (!isAuto.value || velocity.value === 0) {
            return;
        }
        const dt = Math.min(frame.timeSincePreviousFrame ?? 16, 50) / 1000;
        const next = Math.min(
            Math.max(offsetY.value + velocity.value * dt, 0),
            maxOffset,
        );
        offsetY.value = next;
        scrollTo(scrollRef, 0, next, false);
    }, false);

    const start = (dir: 1 | -1) => {
        velocity.value = dir * speed;
        isAuto.value = true;
        auto.setActive(true);
    };
    const stop = () => {
        velocity.value = 0;
        isAuto.value = false;
        auto.setActive(false);
    };

    return (
        <SafeAreaView style={styles.screen} edges={['top']}>
            <Animated.ScrollView
                ref={scrollRef}
                style={StyleSheet.absoluteFill}
                onScroll={onScroll}
                scrollEventThrottle={16}
            >
                <View style={{ height: COUNT * ITEM_HEIGHT }} />
            </Animated.ScrollView>
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <Canvas style={styles.canvas}>
                    {slots.map(i => (
                        <RowSlot
                            key={i}
                            slot={i}
                            offsetY={offsetY}
                            width={width}
                        />
                    ))}
                </Canvas>
            </View>
            <View style={styles.controls} pointerEvents="box-none">
                <RNText style={styles.title}>
                    Skia Paragraph spike · {COUNT} 行 · 每帧重建
                </RNText>
                <View style={styles.controlRow}>
                    <RNText style={styles.ctrlLabel}>速度</RNText>
                    {SPEEDS.map(option => (
                        <TouchableOpacity
                            key={option}
                            style={[
                                styles.btn,
                                option === speed && styles.btnActive,
                            ]}
                            onPress={() => setSpeed(option)}
                        >
                            <RNText style={styles.btnText}>{option}</RNText>
                        </TouchableOpacity>
                    ))}
                </View>
                <View style={styles.controlRow}>
                    <TouchableOpacity
                        style={[styles.btn, styles.action]}
                        onPress={() => start(-1)}
                    >
                        <RNText style={styles.btnText}>↑ 向上</RNText>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.btn, styles.action]}
                        onPress={() => start(1)}
                    >
                        <RNText style={styles.btnText}>↓ 向下</RNText>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.btn, styles.stop]}
                        onPress={stop}
                    >
                        <RNText style={styles.btnText}>停</RNText>
                    </TouchableOpacity>
                </View>
                <RNText style={styles.hint}>
                    看：滚动顺不顺 · 中文/emoji 对不对 · 长标题省略号 ·
                    久滚有无卡/崩
                </RNText>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#111' },
    canvas: { flex: 1 },
    controls: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: 12,
        gap: 8,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    title: { color: '#fff', fontSize: 15, fontWeight: '700' },
    controlRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    ctrlLabel: { color: '#888', fontSize: 12, width: 32 },
    btn: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: '#333',
    },
    btnActive: { backgroundColor: '#4a7' },
    action: { backgroundColor: '#357' },
    stop: { backgroundColor: '#733' },
    btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    hint: { color: '#aaa', fontSize: 12 },
});
