import { StyleSheet, View } from 'react-native';

import { radius, useColors } from '@/design';
import { useT } from '@/i18n';

/**
 * 确定性扫描进度条（首次与重扫全屏进度共用）：processed/total 填充 + progressbar 无障碍语义
 * total 为 0（枚举中未知）时轨道空、不伪造百分比；读屏此时播报枚举中、有总数才给 min/max/now
 */
export function ScanProgressBar({
    processed,
    total,
}: {
    processed: number;
    total: number;
}) {
    const t = useT();
    const colors = useColors();
    const known = total > 0;
    const percent = known ? Math.min(100, (processed / total) * 100) : 0;
    return (
        <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('localMusic.a11y.scanProgress')}
            accessibilityValue={
                known
                    ? { min: 0, max: total, now: Math.min(processed, total) }
                    : { text: t('localMusic.a11y.scanEnumerating') }
            }
            style={[styles.track, { backgroundColor: colors.surfaceVariant }]}
        >
            <View
                style={[
                    styles.fill,
                    { width: `${percent}%`, backgroundColor: colors.primary },
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    // 进度条高度为组件专属几何字面量（细轨，非语义 token 尺度）
    track: {
        width: '100%',
        height: 4,
        borderRadius: radius.full,
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
        borderRadius: radius.full,
    },
});
