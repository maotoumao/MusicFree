import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { definePanel } from '@/components/overlay';
import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { space } from '@/design';
import { useT } from '@/i18n';
import { firstNonBlank } from '@/utils/text';

import type { OverlayProps } from '@/components/overlay';
import type { RecommendTag, RecommendTagGroup } from '@/types';

export interface RecommendTagPanelInput {
    /** 精选：插件置顶的快捷标签（接口 pinned 顺序、只读；非使用频率） */
    pinned: readonly RecommendTag[];
    /** 全部分类分组（data） */
    groups: readonly RecommendTagGroup[];
    /** 当前选中 tagId（决定持续高亮） */
    selectedTagId: string | undefined;
    /** 选了「非当前」tag：写入选择（页面负责关面板后回顶加载） */
    onSelect(tag: RecommendTag): void;
}

/** 一组 Chip 流（换行网格）；label / a11y 取 tag.title，缺失回退 id */
function TagChips({
    tags,
    selectedTagId,
    onPick,
}: {
    tags: readonly RecommendTag[];
    selectedTagId: string | undefined;
    onPick(tag: RecommendTag): void;
}) {
    const t = useT();
    return (
        <View style={styles.chips}>
            {tags.map(tag => {
                const label = firstNonBlank(tag.title) ?? tag.id;
                return (
                    <Chip
                        key={tag.id}
                        label={label}
                        selected={tag.id === selectedTagId}
                        onPress={() => onPick(tag)}
                        accessibilityLabel={t('recommendTagPanel.a11y.tag', {
                            title: label,
                        })}
                    />
                );
            })}
        </View>
    );
}

/**
 * 分组单选分类 Panel（受控）：高频分类（pinned）+ 全部分类（分组 data）
 * payload 为「就绪」快照——标签的 loading / error / retry 由页面分类带处理，本 Panel 只在就绪有内容时被打开
 * 单选、无确认按钮：点非当前 tag 即写选择并关闭；关闭 / 返回不改选择
 */
function RecommendTagPanelView({
    payload,
    close,
}: OverlayProps<RecommendTagPanelInput, void>) {
    const { pinned, groups, selectedTagId, onSelect } = payload;
    const t = useT();

    // 点非当前 tag → 写选择 + 关；点当前 → 只关（不重选、不重置滚动，由页面保证）
    const pick = (tag: RecommendTag) => {
        if (tag.id !== selectedTagId) {
            onSelect(tag);
        }
        close();
    };

    // 全局按显示顺序去重（pinned 优先、再各组）：一个 id 只在首现处占一个选择位；顺带滤无效 id、剔空组
    const { pinnedTags, tagGroups } = useMemo(() => {
        const seen = new Set<string>();
        const takeUnique = (tags: readonly RecommendTag[]) => {
            const out: RecommendTag[] = [];
            for (const tag of tags) {
                if (typeof tag.id === 'string' && tag.id && !seen.has(tag.id)) {
                    seen.add(tag.id);
                    out.push(tag);
                }
            }
            return out;
        };
        const uniquePinned = takeUnique(pinned);
        const groupsOut: {
            key: string;
            title: string | undefined;
            data: RecommendTag[];
        }[] = [];
        for (const group of groups) {
            const data = takeUnique(group.data);
            const first = data[0];
            if (first) {
                groupsOut.push({
                    key: first.id,
                    title: firstNonBlank(group.title),
                    data,
                });
            }
        }
        return { pinnedTags: uniquePinned, tagGroups: groupsOut };
    }, [pinned, groups]);

    return (
        <View style={styles.root}>
            <Text
                size="xl"
                weight="bold"
                lineHeight="tight"
                style={styles.title}
            >
                {t('recommendTagPanel.title')}
            </Text>
            <ScrollView
                style={styles.body}
                contentContainerStyle={styles.content}
            >
                {pinnedTags.length > 0 ? (
                    <View style={styles.section}>
                        <Text size="lg" weight="bold">
                            {t('recommendTagPanel.pinned')}
                        </Text>
                        <TagChips
                            tags={pinnedTags}
                            selectedTagId={selectedTagId}
                            onPick={pick}
                        />
                    </View>
                ) : null}
                {tagGroups.length > 0 ? (
                    <View style={styles.section}>
                        <Text size="lg" weight="bold">
                            {t('recommendTagPanel.all')}
                        </Text>
                        <View style={styles.groups}>
                            {tagGroups.map(group => (
                                <View key={group.key} style={styles.group}>
                                    {group.title ? (
                                        <Text
                                            size="md"
                                            weight="medium"
                                            color="textSecondary"
                                        >
                                            {group.title}
                                        </Text>
                                    ) : null}
                                    <TagChips
                                        tags={group.data}
                                        selectedTagId={selectedTagId}
                                        onPick={pick}
                                    />
                                </View>
                            ))}
                        </View>
                    </View>
                ) : null}
            </ScrollView>
        </View>
    );
}

/** 分组单选分类 Panel：高频分类（pinned）+ 全部分类（分组）；选中即写入并关闭 */
export const showRecommendTagPanel = definePanel(RecommendTagPanelView);

const styles = StyleSheet.create({
    root: {
        flexGrow: 1,
        flexShrink: 1,
    },
    title: {
        paddingHorizontal: space.lg,
        paddingBottom: space.lg,
    },
    body: {
        flexGrow: 1,
        flexShrink: 1,
    },
    content: {
        paddingHorizontal: space.lg,
        paddingBottom: space.lg,
        gap: space.xl,
    },
    section: {
        gap: space.md,
    },
    groups: {
        gap: space.lg,
    },
    group: {
        gap: space.sm,
    },
    // gap 需 ≥ Chip 纵向 hitSlop 之和，避免相邻行命中区重叠
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: space.sm,
    },
});
