import { Pressable, StyleSheet, View } from 'react-native';
import {
    GestureDetector,
    ScrollView,
    usePanGesture,
} from 'react-native-gesture-handler';

import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { borderWidth, layout, space, useColors } from '@/design';
import { useGutterExtra } from '@/hooks/useContentColumn';
import { useT } from '@/i18n';
import { firstNonBlank } from '@/utils/text';

import type { RecommendTag } from '@/types';

interface CategoryBarProps {
    /** 精选（pinned）横滚 Chip */
    pinned: readonly RecommendTag[];
    /** 当前选中分类（决定 Chip 高亮 + 是否补「当前」chip） */
    selectedTag: RecommendTag;
    onSelect(tag: RecommendTag): void;
    /** 打开分组选择 Panel */
    onOpenAll(): void;
}

/**
 * 推荐分类快捷带：pinned 横滚 Chip + 选中可见性「当前」chip + 行末固定「全部分类」入口
 * 比源 TabBar 轻（无下划线）；点 chip 切分类、点入口开分组选择 Panel
 */
export function CategoryBar({
    pinned,
    selectedTag,
    onSelect,
    onOpenAll,
}: CategoryBarProps) {
    const t = useT();
    const colors = useColors();
    // 选中项不在 pinned → 末尾补「当前：{title}」chip，保留选中可见性（不把选择藏进 Panel）
    const selectedInPinned = pinned.some(tag => tag.id === selectedTag.id);
    const selectedLabel = firstNonBlank(selectedTag.title) ?? selectedTag.id;
    // 认领「全部」上的横向拖动，阻止 tab-view pager 误切源；纯点击（横移 < 10px）仍下发 Pressable
    const blockPagerSwipe = usePanGesture({ activeOffsetX: [-10, 10] });
    // 平板：首个 chip 与页面内容线（32）对齐；手机 undefined、沿用 16
    const gutterExtra = useGutterExtra();
    return (
        <View style={[styles.root, { backgroundColor: colors.surface }]}>
            {/* GH ScrollView：横滑（含快速 fling）由 GH 原生拦截，tab-view pager 拿不到 → 不误切源 */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.scroll}
                contentContainerStyle={
                    gutterExtra ? [styles.track, gutterExtra] : styles.track
                }
            >
                {pinned.map(tag => {
                    const label = firstNonBlank(tag.title) ?? tag.id;
                    return (
                        <Chip
                            key={tag.id}
                            label={label}
                            selected={tag.id === selectedTag.id}
                            onPress={() => onSelect(tag)}
                        />
                    );
                })}
                {!selectedInPinned ? (
                    <Chip
                        label={t('recommendPlaylists.currentTag', {
                            title: selectedLabel,
                        })}
                        selected
                        onPress={() => onSelect(selectedTag)}
                    />
                ) : null}
            </ScrollView>
            <GestureDetector gesture={blockPagerSwipe}>
                <Pressable
                    onPress={onOpenAll}
                    style={[
                        styles.allEntry,
                        { borderLeftColor: colors.border },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('recommendPlaylists.allCategories')}
                >
                    <Text size="md" color="textSecondary" numberOfLines={1}>
                        {t('recommendPlaylists.allCategories')}
                    </Text>
                    <Icon
                        name="chevron-right"
                        size={18}
                        color="textSecondary"
                    />
                </Pressable>
            </GestureDetector>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: space.sm,
    },
    scroll: {
        flex: 1,
    },
    track: {
        gap: space.sm,
        paddingHorizontal: space.lg,
        alignItems: 'center',
    },
    allEntry: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingHorizontal: space.lg,
        borderLeftWidth: borderWidth.hairline,
        alignSelf: 'stretch',
        minHeight: layout.hitTarget,
    },
});
