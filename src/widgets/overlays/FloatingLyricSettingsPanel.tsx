/**
 * 悬浮歌词设置面板：形态 / 显示 / 位置 / 外观
 * 全部即时写 config（core 自动调谐浮层）；关闭沿用通用壳（下滑 / 遮罩 / 返回），不回滚——非事务表单
 * 按形态换内容：状态栏条才有位置项（桌面歌词卡靠拖动定位），锁定行两形态都在——状态栏条恒锁定且禁用
 * 预览按真实形态呈现，状态栏条连纵向位置一起还原
 */
import { LinearGradient } from 'expo-linear-gradient';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text as RNText,
    View,
} from 'react-native';

import { useSliderPreview } from '@/components/hooks/useSliderPreview';
import { definePanel } from '@/components/overlay';
import { ListItem } from '@/components/ui/ListItem';
import { Section } from '@/components/ui/Section';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { Text } from '@/components/ui/Text';
import { config, useConfig } from '@/core/config';
import {
    DESKTOP_FONT_SIZE_STEPS,
    floatingLyric,
    resolveFontSize,
    STATUS_BAR_FONT_SIZE_STEPS,
} from '@/core/floatingLyric';
import {
    borderWidth,
    layout,
    opacity,
    radius,
    space,
    useColors,
} from '@/design';
import { useT } from '@/i18n';
import { showColorPickerPanel } from '@/widgets/overlays/ColorPickerPanel';

import type { FloatingLyricMode } from '@/types';

const DEFAULT_TEXT_COLOR = '#FFFFFF';
// 与原生一致的排版比例：行高倍率、译文比原文小的字号差、译文不透明度
const PREVIEW_LINE_HEIGHT_RATIO = 1.4;
const TRANSLATION_SIZE_DELTA = 4;
const TRANSLATION_OPACITY = 0.76;
// 预览舞台固定高度：状态栏条要在里面按 positionY 上下移动，舞台会变高就看不出差别
const PREVIEW_STAGE_HEIGHT = 132;

/**
 * 快捷位置写入的锚点值；选中态由当前值反推，不单独存
 * 状态栏条按整屏归一化，顶部就是 0——留边距会正好把它推到状态栏下沿
 */
const QUICK_POSITIONS = [
    { key: 'top', value: 0 },
    { key: 'middle', value: 0.5 },
    { key: 'bottom', value: 0.92 },
] as const;

// 反推快捷档的容差要小于微调步长的一半，否则微调一格后仍显示某档选中
const POSITION_STEP = 0.01;
const QUICK_POSITION_TOLERANCE = POSITION_STEP / 2;

interface SegmentOption {
    value: string;
    label: string;
}

/** 等分分段单选：形态 / 快捷位置 / 字号共用同一套命中区与选中态 */
function SegmentedRow({
    options,
    selected,
    onSelect,
    accessibilityLabel,
}: {
    options: readonly SegmentOption[];
    selected: (value: string) => boolean;
    onSelect: (value: string) => void;
    accessibilityLabel: string;
}) {
    const colors = useColors();
    return (
        <View
            style={styles.segments}
            accessibilityRole="radiogroup"
            accessibilityLabel={accessibilityLabel}
        >
            {options.map(option => {
                const active = selected(option.value);
                return (
                    <Pressable
                        key={option.value}
                        onPress={() => onSelect(option.value)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={option.label}
                        style={({ pressed }) => [
                            styles.segment,
                            {
                                backgroundColor: active
                                    ? colors.primary
                                    : colors.surfaceVariant,
                            },
                            pressed && { opacity: opacity.pressed },
                        ]}
                    >
                        <Text
                            size="sm"
                            weight="medium"
                            color={active ? 'onPrimary' : 'text'}
                        >
                            {option.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

/**
 * 标签 + 实时数值 + 滑杆的一行
 *
 * 单独成组件而不是内联进面板：拖动中每帧要刷新数值，挂在面板上会把整张表连预览一起重渲
 */
function SliderRow({
    label,
    value,
    min,
    max,
    step,
    format,
    onChangeEnd,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    /** 值 → 展示文案；拖动中喂的是手势值，故不能在外面提前算好 */
    format: (value: number) => string;
    onChangeEnd: (value: number) => void;
}) {
    const preview = useSliderPreview(value, { onChangeEnd });
    return (
        <View style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text size="sm" color="textSecondary">
                {format(preview.displayValue)}
            </Text>
            <Slider
                style={styles.slider}
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={preview.onChange}
                onChangeEnd={preview.onChangeEnd}
                onChangeCancel={preview.onChangeCancel}
                accessibilityLabel={label}
                // 朗读已提交值而非拖动值：读屏用的是加减档（只走 onChangeEnd）
                accessibilityValueText={format(value)}
            />
        </View>
    );
}

function FloatingLyricSettingsPanelView() {
    const t = useT();
    const colors = useColors();
    const enabled = useConfig('floatingLyric.enabled') ?? false;
    const mode = useConfig('floatingLyric.mode') ?? 'desktop';
    const statusBar = mode === 'statusBar';
    const fontSizeSteps = statusBar
        ? STATUS_BAR_FONT_SIZE_STEPS
        : DESKTOP_FONT_SIZE_STEPS;
    // 回显按实际生效的档位：config 允许表外值，直接显示会与浮层不一致
    const desktopFontSize = useConfig('floatingLyric.desktop.fontSize') ?? 18;
    const statusBarFontSize =
        useConfig('floatingLyric.statusBar.fontSize') ?? 14;
    const fontSize = resolveFontSize(
        statusBar ? statusBarFontSize : desktopFontSize,
        fontSizeSteps,
    );
    const showTranslation = useConfig('lyric.showTranslation') ?? false;
    const textColor =
        useConfig('floatingLyric.textColor') ?? DEFAULT_TEXT_COLOR;
    const desktopOpacity =
        useConfig('floatingLyric.desktop.backgroundOpacity') ?? 0.55;
    const statusBarOpacity =
        useConfig('floatingLyric.statusBar.backgroundOpacity') ?? 0;
    const backgroundOpacity = statusBar ? statusBarOpacity : desktopOpacity;
    const locked = useConfig('floatingLyric.desktop.locked') ?? false;
    const positionY = useConfig('floatingLyric.statusBar.positionY') ?? 0;

    // 状态栏条恒 1 行只显示原文；卡片恒 2 行，有译文时原文 1 行 + 译文 1 行
    const lineHeight = fontSize * PREVIEW_LINE_HEIGHT_RATIO;
    const translationSize = fontSize - TRANSLATION_SIZE_DELTA;
    const previewHeight = statusBar
        ? lineHeight + PREVIEW_BAR_PADDING_V * 2
        : lineHeight * 2 + space.sm * 2;
    // 卡片锁定后没有底色，预览一并去掉，用户能预判「锁定后只剩文字」
    const previewSurface =
        !statusBar && locked
            ? 'transparent'
            : `rgba(0,0,0,${backgroundOpacity})`;
    // 与原生一致：按「可移动范围 = 舞台高 − 自身高」归一化
    const previewOffsetY = Math.round(
        positionY * Math.max(PREVIEW_STAGE_HEIGHT - previewHeight, 0),
    );

    const toggleEnabled = (next: boolean): void => {
        if (next) {
            floatingLyric.enable().catch(e => {
                if (__DEV__) {
                    console.warn('[floatingLyric] enable 失败', e);
                }
            });
        } else {
            floatingLyric.disable();
        }
    };

    const setFontSize = (step: string): void => {
        config.set(
            statusBar
                ? 'floatingLyric.statusBar.fontSize'
                : 'floatingLyric.desktop.fontSize',
            Number(step),
        );
    };

    const setBackgroundOpacity = (value: number): void => {
        config.set(
            statusBar
                ? 'floatingLyric.statusBar.backgroundOpacity'
                : 'floatingLyric.desktop.backgroundOpacity',
            Math.round(value * 20) / 20,
        );
    };

    const openColorPicker = (): void => {
        showColorPickerPanel({
            title: t('floatingLyricSettingsPanel.textColor'),
            value: textColor,
            defaultValue: DEFAULT_TEXT_COLOR,
            onChange: hex => config.set('floatingLyric.textColor', hex),
        });
    };

    return (
        <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.root}
            showsVerticalScrollIndicator={false}
        >
            <Text size="xl" weight="bold" lineHeight="tight">
                {t('floatingLyricSettingsPanel.title')}
            </Text>

            {/* 预览：压在模拟壁纸上，仅展示不可拖；状态栏条连纵向位置一起还原 */}
            <LinearGradient
                colors={[colors.coverVeil, colors.coverScrim]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.previewStage}
            >
                <View
                    style={[
                        styles.preview,
                        statusBar && styles.previewBar,
                        {
                            height: previewHeight,
                            backgroundColor: previewSurface,
                        },
                        statusBar && { marginTop: previewOffsetY },
                    ]}
                >
                    <RNText
                        allowFontScaling={false}
                        numberOfLines={statusBar || showTranslation ? 1 : 2}
                        style={[
                            styles.previewText,
                            { color: textColor, fontSize, lineHeight },
                        ]}
                    >
                        {t('floatingLyricSettingsPanel.preview.original')}
                    </RNText>
                    {!statusBar && showTranslation ? (
                        <RNText
                            allowFontScaling={false}
                            numberOfLines={1}
                            style={[
                                styles.previewText,
                                {
                                    color: textColor,
                                    fontSize: translationSize,
                                    lineHeight:
                                        translationSize *
                                        PREVIEW_LINE_HEIGHT_RATIO,
                                    opacity: TRANSLATION_OPACITY,
                                },
                            ]}
                        >
                            {t(
                                'floatingLyricSettingsPanel.preview.translation',
                            )}
                        </RNText>
                    ) : null}
                </View>
            </LinearGradient>

            {/* —— 形态 —— 先选形态，后面的项按形态而变；两者互斥，同时挂两条歌词没有意义 */}
            <Section
                heading="label"
                title={t('floatingLyricSettingsPanel.group.mode')}
            >
                <SegmentedRow
                    options={[
                        {
                            value: 'desktop',
                            label: t('floatingLyricSettingsPanel.mode.desktop'),
                        },
                        {
                            value: 'statusBar',
                            label: t(
                                'floatingLyricSettingsPanel.mode.statusBar',
                            ),
                        },
                    ]}
                    selected={value => value === mode}
                    onSelect={value =>
                        config.set(
                            'floatingLyric.mode',
                            value as FloatingLyricMode,
                        )
                    }
                    accessibilityLabel={t(
                        'floatingLyricSettingsPanel.group.mode',
                    )}
                />
            </Section>

            {/* —— 显示 —— */}
            <Section
                heading="label"
                title={t('floatingLyricSettingsPanel.group.display')}
            >
                <View style={styles.bleedRow}>
                    <ListItem
                        title={
                            <Text>
                                {t('floatingLyricSettingsPanel.enabled')}
                            </Text>
                        }
                        // 尾部走 inline 进入行主体 Pressable：外置 trailing 的右 gutter
                        // 落在普通 View 上点不动，整行可点会有死角
                        trailing={
                            <Switch
                                checked={enabled}
                                onChange={toggleEnabled}
                                // 整行已给命中区，开关不必再撑 44 壳
                                dense
                                accessibilityLabel={t(
                                    'floatingLyricSettingsPanel.enabled',
                                )}
                            />
                        }
                        trailingInline
                        dense
                        onPress={() => toggleEnabled(!enabled)}
                        accessibilityLabel={t(
                            'floatingLyricSettingsPanel.enabled',
                        )}
                    />
                </View>

                {/* 状态栏条不接收触摸、无从拖动，锁定恒真且不可改；行仍保留，切形态时不跳变 */}
                <View style={styles.bleedRow}>
                    <ListItem
                        title={
                            <Text color={statusBar ? 'textDisabled' : 'text'}>
                                {t('floatingLyricSettingsPanel.locked')}
                            </Text>
                        }
                        trailing={
                            <Switch
                                checked={statusBar || locked}
                                disabled={statusBar}
                                dense
                                onChange={v =>
                                    config.set(
                                        'floatingLyric.desktop.locked',
                                        v,
                                    )
                                }
                                accessibilityLabel={t(
                                    'floatingLyricSettingsPanel.locked',
                                )}
                            />
                        }
                        trailingInline
                        dense
                        // 不可改时不给 onPress：整行退化为非交互，禁用语义由开关自身播报
                        onPress={
                            statusBar
                                ? undefined
                                : () =>
                                      config.set(
                                          'floatingLyric.desktop.locked',
                                          !locked,
                                      )
                        }
                        accessibilityLabel={t(
                            'floatingLyricSettingsPanel.locked',
                        )}
                    />
                </View>
            </Section>

            {/* —— 外观 —— */}
            <Section
                heading="label"
                title={t('floatingLyricSettingsPanel.group.appearance')}
            >
                {/* 字号独占一行：5 档等分才够 44dp 命中区，窄屏也不会挤成不规则换行 */}
                <View style={styles.stackRow}>
                    <Text style={styles.label}>
                        {t('floatingLyricSettingsPanel.fontSize')}
                    </Text>
                    <SegmentedRow
                        options={fontSizeSteps.map(step => ({
                            value: String(step),
                            label: String(step),
                        }))}
                        selected={value => Number(value) === fontSize}
                        onSelect={setFontSize}
                        accessibilityLabel={t(
                            'floatingLyricSettingsPanel.fontSize',
                        )}
                    />
                </View>

                <View style={styles.bleedRow}>
                    <ListItem
                        title={
                            <Text>
                                {t('floatingLyricSettingsPanel.textColor')}
                            </Text>
                        }
                        trailing={
                            <View
                                style={[
                                    styles.swatch,
                                    {
                                        backgroundColor: textColor,
                                        borderColor: colors.border,
                                    },
                                ]}
                            />
                        }
                        // 色块是当前值的呈现、不是另一个控件：点它就该开取色器
                        trailingInline
                        dense
                        onPress={openColorPicker}
                        accessibilityLabel={t(
                            'floatingLyricSettingsPanel.textColor',
                        )}
                    />
                </View>

                <SliderRow
                    label={t('floatingLyricSettingsPanel.backgroundOpacity')}
                    value={backgroundOpacity}
                    min={0}
                    max={0.9}
                    step={0.05}
                    format={v => `${Math.round(v * 100)}%`}
                    onChangeEnd={setBackgroundOpacity}
                />
            </Section>

            {/* —— 位置 —— 状态栏条不能拖，面板是它唯一的位置入口 */}
            {statusBar ? (
                <Section
                    heading="label"
                    title={t('floatingLyricSettingsPanel.group.position')}
                >
                    <View style={styles.stackRow}>
                        <Text style={styles.label}>
                            {t('floatingLyricSettingsPanel.quickPosition')}
                        </Text>
                        <SegmentedRow
                            options={QUICK_POSITIONS.map(({ key }) => ({
                                value: key,
                                label: t(
                                    `floatingLyricSettingsPanel.position.${key}`,
                                ),
                            }))}
                            selected={key => {
                                const target = QUICK_POSITIONS.find(
                                    p => p.key === key,
                                );
                                return (
                                    target !== undefined &&
                                    Math.abs(positionY - target.value) <
                                        QUICK_POSITION_TOLERANCE
                                );
                            }}
                            onSelect={key => {
                                const target = QUICK_POSITIONS.find(
                                    p => p.key === key,
                                );
                                if (target) {
                                    config.set(
                                        'floatingLyric.statusBar.positionY',
                                        target.value,
                                    );
                                }
                            }}
                            accessibilityLabel={t(
                                'floatingLyricSettingsPanel.quickPosition',
                            )}
                        />
                    </View>

                    <SliderRow
                        label={t('floatingLyricSettingsPanel.positionFine')}
                        value={positionY}
                        min={0}
                        max={1}
                        step={POSITION_STEP}
                        format={v => `${Math.round(v * 100)}%`}
                        onChangeEnd={v =>
                            config.set(
                                'floatingLyric.statusBar.positionY',
                                Math.round(v * 100) / 100,
                            )
                        }
                    />
                </Section>
            ) : null}
        </ScrollView>
    );
}

/** 打开悬浮歌词设置面板：所有控件即时写 config，浮层由 core 自动调谐 */
export const showFloatingLyricSettingsPanel = definePanel<void, void>(
    FloatingLyricSettingsPanelView,
);

// 状态栏条的内距与圆角对齐原生 FloatingLyricBarView
const PREVIEW_BAR_PADDING_H = 10;
const PREVIEW_BAR_PADDING_V = 3;
const PREVIEW_BAR_RADIUS = 10;

const styles = StyleSheet.create({
    scroll: {
        flexShrink: 1,
    },
    root: {
        paddingHorizontal: space.lg,
        // 段落感：标题 / 预览 / 各分组之间拉开，组内的行由 section 自己收紧
        gap: space.xl,
    },
    previewStage: {
        height: PREVIEW_STAGE_HEIGHT,
        justifyContent: 'center',
        borderRadius: radius.lg,
        overflow: 'hidden',
        // 卡片近乎占满：真机上它是「视口宽 − 24dp」，留太多余白就成了大框套小框
        paddingHorizontal: space.sm,
    },
    preview: {
        justifyContent: 'center',
        borderRadius: radius.xl,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
    },
    // 宽度跟随文字、横向居中，底色不铺满整行；纵向按 positionY 从舞台顶部下移
    previewBar: {
        position: 'absolute',
        top: 0,
        alignSelf: 'center',
        borderRadius: PREVIEW_BAR_RADIUS,
        paddingHorizontal: PREVIEW_BAR_PADDING_H,
        paddingVertical: PREVIEW_BAR_PADDING_V,
    },
    previewText: {
        textAlign: 'center',
        // 常驻阴影：底色淡出 / 锁定后，浮层就靠它保可读性，预览须一致
        textShadowColor: 'rgba(0,0,0,0.39)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: layout.hitTarget,
    },
    stackRow: {
        gap: space.sm,
        paddingVertical: space.xs,
    },
    // ListItem 自带行内边距，抵消 root 的横向留白：文字仍与其余项对齐，按压反馈整行贯通
    bleedRow: {
        marginHorizontal: -space.lg,
    },
    label: {
        flexShrink: 0,
    },
    slider: {
        flex: 1,
    },
    segments: {
        flexDirection: 'row',
        gap: space.xs,
    },
    segment: {
        flex: 1,
        minHeight: layout.hitTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
    },
    swatch: {
        width: 24,
        height: 24,
        borderRadius: radius.full,
        borderWidth: borderWidth.hairline,
    },
});
