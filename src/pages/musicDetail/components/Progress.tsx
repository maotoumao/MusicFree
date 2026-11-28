import { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SeekBar } from '@/components/ui/SeekBar';
import { Text } from '@/components/ui/Text';
import { player, useProgress } from '@/core/player';
import { space, useColors } from '@/design';
import { useT } from '@/i18n';
import { colord } from '@/utils/color';
import { formatDuration } from '@/utils/time';

/** 进度：SeekBar + 时间标签，独立订阅 useProgress（500ms tick 只重渲染本条） */
export const Progress = memo(function ProgressBase() {
    const colors = useColors();
    const t = useT();
    const { position, duration, buffered } = useProgress();
    // seek 后乐观值：松手到真实 position 追上前，条不回跳
    const [optimistic, setOptimistic] = useState<number | null>(null);
    // 拖动实时预览（喂时间标签）
    const [preview, setPreview] = useState<number | null>(null);

    useEffect(() => {
        if (optimistic != null && Math.abs(position - optimistic) < 1) {
            setOptimistic(null);
        }
    }, [position, optimistic]);

    const value = optimistic ?? position;
    return (
        <View>
            <SeekBar
                value={value}
                max={duration}
                buffered={buffered}
                trackColor={colors.coverBorder}
                fillColor={colors.coverAccent}
                bufferedColor={colord(colors.coverText)
                    .alpha(0.28)
                    .toRgbString()}
                thumbColor={colors.coverText}
                accessibilityLabel={t('musicDetail.a11y.progress')}
                onSeekChange={setPreview}
                onSeekEnd={v => {
                    setOptimistic(v);
                    setPreview(null);
                    // seek 失败则回滚乐观值，条回到真实位置、不卡在目标
                    player.seekTo(v).catch(() => setOptimistic(null));
                }}
                onSeekCancel={() => setPreview(null)}
            />
            {/* 时间行不传 lineHeight（沿用原生字体度量）：本条五个形态共用，
                改它就改了竖屏与平板的渲染。矮窗口的高度预算按 normal(1.4) 记账，
                见 lib/layout 的 PROGRESS_HEIGHT——那是保守上界，只多算不少算 */}
            <View style={styles.times} pointerEvents="none">
                <Text size="xs" color="coverTextSecondary" style={styles.time}>
                    {formatDuration(preview ?? value)}
                </Text>
                <Text size="xs" color="coverTextSecondary" style={styles.time}>
                    {formatDuration(duration)}
                </Text>
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    times: {
        // 负 marginTop 把时间拉进 SeekBar 命中区下缘、贴近细轨（times 非交互、pointerEvents none 不挡拖动）
        marginTop: -space.sm,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    // 等宽数字，秒数跳动不抖
    time: {
        fontVariant: ['tabular-nums'],
    },
});
