import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { space } from '@/design';
import { useContentGutter } from '@/hooks/useContentColumn';
import { useT } from '@/i18n';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import {
    clearSearchHistory,
    removeSearchHistory,
    useSearchHistory,
} from '../lib/history';

/** 搜索历史区：无历史不渲染；点 chip 立即以该词提交搜索（对齐 legacy） */
export function SearchHistorySection({
    onPick,
}: {
    onPick: (query: string) => void;
}) {
    const t = useT();
    const history = useSearchHistory();
    const clear = useCallback(async () => {
        const ok = await showConfirmDialog({
            title: t('search.clearHistoryConfirm.title'),
            message: t('search.clearHistoryConfirm.message'),
            danger: true,
        });
        if (ok) {
            clearSearchHistory();
        }
    }, [t]);
    // 平板：历史区内容线 16 → 32，与顶栏图标同一条线（手机 undefined、styles.root 原样）
    const gutter = useContentGutter();
    if (history.length === 0) {
        return null;
    }
    return (
        <View style={gutter ? [styles.root, gutter] : styles.root}>
            <View style={styles.header}>
                <Text size="md" weight="bold">
                    {t('search.history')}
                </Text>
                <Button
                    variant="ghost"
                    tone="neutral"
                    size="sm"
                    onPress={clear}
                >
                    {t('common.clear')}
                </Button>
            </View>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.chips}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
            >
                {history.map(query => (
                    <Chip
                        key={query}
                        label={query}
                        onPress={() => onPick(query)}
                        accessibilityLabel={t('search.a11y.searchHistory', {
                            query,
                        })}
                        onRemove={() => removeSearchHistory(query)}
                        removeAccessibilityLabel={t(
                            'search.a11y.removeSearchHistory',
                            { query },
                        )}
                    />
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        paddingHorizontal: space.lg,
        /** 头部行被 ghost「清除」按钮撑到 controlHeight.sm，标题在其中居中后上下各自带约 9dp 留白，与此处相加才接近内容线 */
        paddingTop: space.sm,
        paddingBottom: space.lg,
    },
    /** 不设 marginBottom：头部行自带的约 9dp 下留白加 chips 容器的纵向内距已够拉开，且小于头部上方间距，标题才与历史项归成一组 */
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        /** 右端 ghost Button 自带的水平内距已等于内容线，抵掉容器这侧内距免叠加 */
        marginRight: -space.lg,
    },
    scroll: {
        flex: 1,
    },
    /**
     * rowGap 需 ≥ Chip 纵向 hitSlop 之和避免相邻行命中区重叠，且大于 columnGap 使 wrap 网格按行可扫读
     * paddingVertical 给首末行的 hitSlop 留空间；命中区不会越过父视图边界，仍有约 1dp 落在容器外被裁掉
     */
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: space.sm,
        rowGap: space.md,
        paddingVertical: space.xs,
    },
});
