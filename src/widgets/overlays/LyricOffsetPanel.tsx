/**
 * 歌词时间偏移面板：滑杆范围为 ±10 秒，步进为 0.1 秒；支持 ±0.1 秒微调和重置；拖动时实时预览，松手后持久化
 * 单曲级偏移，仅作用于当前歌曲；无时间轴的纯文本歌词由工具行入口置灰，不打开此面板
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { definePanel } from '@/components/overlay';
import { Slider } from '@/components/ui/Slider';
import { Text } from '@/components/ui/Text';
import { lyric, useLyricOffset } from '@/core/lyric';
import { player, useCurrentMusic } from '@/core/player';
import { layout, opacity, radius, space, useColors } from '@/design';
import { useT } from '@/i18n';
import { isSameMediaRef } from '@/utils/media';

import type { OverlayProps } from '@/components/overlay';

// 偏移范围和步进，单位为秒
const MIN_OFFSET = -10;
const MAX_OFFSET = 10;
const STEP = 0.1;

/** 将值限制在允许范围内，并归一到 1 位小数，避免吸附或累加产生浮点误差 */
function normalize(value: number): number {
    const clamped = Math.min(MAX_OFFSET, Math.max(MIN_OFFSET, value));
    return Math.round(clamped * 10) / 10;
}

function LyricOffsetPanelView({ close }: OverlayProps<void, void>) {
    const t = useT();
    const colors = useColors();
    const initial = useLyricOffset();
    const [offset, setOffset] = useState(() => initial.user);
    // 面板绑定打开时的歌曲：命令执行时通过 player 的同步状态校验；切歌后关闭面板，避免将旧值写入新歌曲
    const current = useCurrentMusic();
    const openedRef = useRef(current);
    const lastCommitted = useRef(initial.user);
    // 切歌后重新渲染：面板不再对应当前歌曲时关闭，清理界面状态
    useEffect(() => {
        if (
            openedRef.current == null ||
            current == null ||
            !isSameMediaRef(current, openedRef.current)
        ) {
            close();
        }
    }, [current, close]);
    // 命令执行时同步校验目标歌曲，不依赖 React 渲染快照，避免切歌与松手回调并发造成误写
    const isTargetCurrent = () =>
        openedRef.current != null && player.isCurrent(openedRef.current);

    // 方向化文案：正值表示提前，负值表示延迟，0 表示无偏移
    const label =
        offset === 0
            ? t('lyricOffsetPanel.none')
            : offset > 0
            ? t('lyricOffsetPanel.advance', { seconds: offset.toFixed(1) })
            : t('lyricOffsetPanel.delay', { seconds: (-offset).toFixed(1) });

    // 拖动时实时预览：应用到歌词运行时状态，但不持久化
    const preview = (value: number) => {
        if (!isTargetCurrent()) {
            return;
        }
        const next = normalize(value);
        setOffset(next);
        lyric.previewLyricOffset(next);
    };
    // 松手、微调或重置：应用偏移并持久化
    const commit = (value: number) => {
        if (!isTargetCurrent()) {
            return;
        }
        const next = normalize(value);
        setOffset(next);
        lastCommitted.current = next;
        lyric.commitLyricOffset(next);
    };
    // 取消拖动：预览已修改运行时状态，恢复到最近一次已提交的值
    const cancel = () => {
        if (!isTargetCurrent()) {
            return;
        }
        setOffset(lastCommitted.current);
        lyric.previewLyricOffset(lastCommitted.current);
    };

    return (
        <View style={styles.root}>
            <Text size="xl" weight="bold" lineHeight="tight">
                {t('lyricOffsetPanel.title')}
            </Text>
            <Text
                size="lg"
                weight="medium"
                color={offset === 0 ? 'textSecondary' : 'primary'}
                style={styles.value}
            >
                {label}
            </Text>
            <View style={styles.row}>
                <Pressable
                    onPress={() => commit(offset - STEP)}
                    accessibilityRole="button"
                    accessibilityLabel={t('lyricOffsetPanel.a11y.delayStep')}
                    style={({ pressed }) => [
                        styles.step,
                        { backgroundColor: colors.surfaceVariant },
                        pressed && { opacity: opacity.pressed },
                    ]}
                >
                    <Text weight="medium">{`-${STEP.toFixed(1)}s`}</Text>
                </Pressable>
                <Slider
                    style={styles.slider}
                    value={offset}
                    min={MIN_OFFSET}
                    max={MAX_OFFSET}
                    step={STEP}
                    onChange={preview}
                    onChangeEnd={commit}
                    onChangeCancel={cancel}
                    accessibilityLabel={label}
                />
                <Pressable
                    onPress={() => commit(offset + STEP)}
                    accessibilityRole="button"
                    accessibilityLabel={t('lyricOffsetPanel.a11y.advanceStep')}
                    style={({ pressed }) => [
                        styles.step,
                        { backgroundColor: colors.surfaceVariant },
                        pressed && { opacity: opacity.pressed },
                    ]}
                >
                    <Text weight="medium">{`+${STEP.toFixed(1)}s`}</Text>
                </Pressable>
            </View>
            <Pressable
                onPress={() => commit(0)}
                disabled={offset === 0}
                accessibilityRole="button"
                accessibilityState={{ disabled: offset === 0 }}
                accessibilityLabel={t('lyricOffsetPanel.a11y.reset')}
                style={({ pressed }) => [
                    styles.reset,
                    pressed && { opacity: opacity.pressed },
                ]}
            >
                <Text
                    color={offset === 0 ? 'textDisabled' : 'text'}
                    weight="medium"
                >
                    {t('lyricOffsetPanel.reset')}
                </Text>
            </Pressable>
        </View>
    );
}

/** 打开歌词时间偏移面板（作用于当前歌，拖动实时预览、松手持久化） */
export const showLyricOffsetPanel = definePanel<void, void>(
    LyricOffsetPanelView,
);

const styles = StyleSheet.create({
    root: {
        paddingHorizontal: space.lg,
        gap: space.md,
    },
    value: {
        textAlign: 'center',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        // 间隔留出滑块被拖动放大后越过轨道两端的余量，避免高亮拇指被微调按钮遮挡
        gap: space.lg,
    },
    slider: {
        flex: 1,
    },
    step: {
        minHeight: layout.hitTarget,
        justifyContent: 'center',
        paddingHorizontal: space.md,
        borderRadius: radius.md,
    },
    reset: {
        minHeight: layout.hitTarget,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
