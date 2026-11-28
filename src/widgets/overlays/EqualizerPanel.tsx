/**
 * 音效 / 均衡器面板（底部 Panel）：全局音效，即时生效
 * 主开关 + 系统预设（英文名 i18n 映射中文）+ 频段竖滑块（双极、零线）+ 重置
 * 关闭态控件降透明度但仍可交互，拖动 / 选预设由 core/audioEffect 自动开启
 * 不可用时给不支持提示（入口通常已按 available 隐藏）；正文纵向可滚，频段横向可滚（多段设备）
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { definePanel } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Switch } from '@/components/ui/Switch';
import { Text } from '@/components/ui/Text';
import { VerticalSlider } from '@/components/ui/VerticalSlider';
import {
    audioEffect,
    useEqualizerAvailable,
    useEqualizerBands,
    useEqualizerEnabled,
    useEqualizerPreset,
    useEqualizerPresets,
} from '@/core/audioEffect';
import { space, useColors } from '@/design';
import { useT } from '@/i18n';
import { useEqualizerPresetLabel } from '@/widgets/hooks/useEqualizerPresetLabel';

import type { EqualizerBand } from '@/core/audioEffect';

/** 频段增益吸附步长（millibel）：100 = 1 dB，拖动按整 dB 跳档 */
const GAIN_STEP = 100;
/** 频段竖滑块轨道高度；拖到两端时滑块球会溢出轨道半个球，故列内另留上下间距 */
const BAND_HEIGHT = 124;
/** 每频段列固定宽度：各列等宽（容 44 命中区滑块 + ±15 dB / 频率标签），与内容无关 */
const BAND_WIDTH = 56;

/** millibel → dB 展示（+6 dB / 0 dB / −2 dB） */
function formatDb(millibel: number): string {
    const db = Math.round(millibel / 100);
    if (db > 0) {
        return `+${db} dB`;
    }
    if (db < 0) {
        return `−${-db} dB`;
    }
    return '0 dB';
}

/** 中心频率 → 展示（60Hz / 3.6k / 14k） */
function formatHz(hz: number): string {
    return hz >= 1000 ? `${Math.round(hz / 100) / 10}k` : `${hz}Hz`;
}

/** 单频段列：dB 文案 + 双极竖滑块 + 频率文案；拖动中显示实时 dB，松手提交到 core */
function BandColumn({ band }: { band: EqualizerBand }) {
    const t = useT();
    const [live, setLive] = useState<number | null>(null);
    const gain = live ?? band.gain;
    const dbLabel = formatDb(gain);
    const freqLabel = formatHz(band.centerFreq);
    return (
        <View style={styles.band}>
            <Text
                size="xs"
                weight="bold"
                numberOfLines={1}
                color={gain === 0 ? 'textSecondary' : 'primary'}
            >
                {dbLabel}
            </Text>
            <VerticalSlider
                value={band.gain}
                min={band.minGain}
                max={band.maxGain}
                step={GAIN_STEP}
                baseline={0}
                showBaseline
                height={BAND_HEIGHT}
                onChange={setLive}
                onChangeEnd={v => {
                    setLive(null);
                    audioEffect
                        .setEqualizerBandGain(band.index, v)
                        .catch(() => {});
                }}
                onChangeCancel={() => setLive(null)}
                accessibilityLabel={t('equalizerPanel.a11y.band', {
                    freq: freqLabel,
                })}
                accessibilityValueText={dbLabel}
                style={styles.slider}
            />
            <Text size="xs" color="textSecondary" numberOfLines={1}>
                {freqLabel}
            </Text>
        </View>
    );
}

function EqualizerPanelView() {
    const t = useT();
    const colors = useColors();
    const presetLabel = useEqualizerPresetLabel();
    const available = useEqualizerAvailable();
    const enabled = useEqualizerEnabled();
    const bands = useEqualizerBands();
    const presets = useEqualizerPresets();
    const selected = useEqualizerPreset();

    // 入口已按 available 门控；防御性兜底（正常不会打开到此）
    if (!available) {
        return (
            <View style={styles.root}>
                <Text size="xl" weight="bold" lineHeight="tight">
                    {t('equalizerPanel.title')}
                </Text>
                <Text size="sm" color="textSecondary">
                    {t('equalizerPanel.unavailable')}
                </Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.root}
            showsVerticalScrollIndicator={false}
        >
            <View style={styles.header}>
                <View style={styles.headerText}>
                    <Text size="xl" weight="bold" lineHeight="tight">
                        {t('equalizerPanel.title')}
                    </Text>
                    <Text size="sm" color="textSecondary">
                        {t('equalizerPanel.scope')}
                    </Text>
                </View>
                <Switch
                    checked={enabled}
                    onChange={v =>
                        audioEffect.setEqualizerEnabled(v).catch(() => {})
                    }
                    accessibilityLabel={t('equalizerPanel.a11y.toggle')}
                />
            </View>

            <View style={[styles.controls, !enabled && styles.dimmed]}>
                <Text size="sm" color="textSecondary">
                    {t('equalizerPanel.presetLabel')}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View
                        style={styles.chipsRow}
                        accessibilityRole="radiogroup"
                        accessibilityLabel={t('equalizerPanel.a11y.curveGroup')}
                    >
                        {/* 自定义常驻首位：点它切回上次手调曲线（没调过 / 段数不符则全 0） */}
                        <Chip
                            label={t('equalizerPanel.custom')}
                            selected={selected === null}
                            accessibilityRole="radio"
                            onPress={() =>
                                audioEffect
                                    .applyEqualizerCustom()
                                    .catch(() => {})
                            }
                        />
                        {presets.map(name => (
                            <Chip
                                key={name}
                                label={presetLabel(name)}
                                selected={selected === name}
                                accessibilityRole="radio"
                                onPress={() =>
                                    audioEffect
                                        .applyEqualizerPreset(name)
                                        .catch(() => {})
                                }
                            />
                        ))}
                    </View>
                </ScrollView>

                <View
                    style={[styles.divider, { backgroundColor: colors.border }]}
                />

                {/* 频段横向可滚：段数多于可容纳时滚动，少时 flexGrow 铺满；各列固定等宽 */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.bands}
                >
                    {bands.map(band => (
                        <BandColumn key={band.index} band={band} />
                    ))}
                </ScrollView>

                <Button
                    variant="soft"
                    onPress={() => audioEffect.resetEqualizer().catch(() => {})}
                    accessibilityLabel={t('equalizerPanel.a11y.reset')}
                >
                    {t('equalizerPanel.reset')}
                </Button>
            </View>
        </ScrollView>
    );
}

/** 打开音效 / 均衡器面板：全局即时生效，关闭走通用壳（遮罩 / 返回键） */
export const showEqualizerPanel = definePanel<void, void>(EqualizerPanelView);

const styles = StyleSheet.create({
    scroll: {
        flexShrink: 1,
    },
    root: {
        paddingHorizontal: space.lg,
        paddingTop: space.sm,
        gap: space.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.md,
    },
    headerText: {
        flexShrink: 1,
        gap: space.xs / 2,
    },
    controls: {
        gap: space.md,
    },
    dimmed: {
        opacity: 0.42,
    },
    chipsRow: {
        flexDirection: 'row',
        gap: space.sm,
        paddingRight: space.lg,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
    },
    bands: {
        flexGrow: 1,
        justifyContent: 'space-around',
        paddingVertical: space.sm,
    },
    band: {
        width: BAND_WIDTH,
        alignItems: 'center',
        gap: space.xs,
    },
    // 拖到两端时滑块球溢出轨道半个球（拖动态 11dp），加此留白避免压住上下的 dB / 频率文字
    slider: {
        marginVertical: space.sm,
    },
});
