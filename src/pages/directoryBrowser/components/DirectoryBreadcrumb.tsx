import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { borderWidth, layout, space, useColors } from '@/design';
import { useT } from '@/i18n';

import { storageRootLabel } from '../lib/storageRootLabel';

import type { DirEntry } from '@/infra/fileBrowser';

/** 面包屑一段：当前层高亮 + 读屏状态（不可点），祖先层可点回跳；两者等高、命中区达 hitTarget */
function Crumb({
    label,
    current,
    a11yCurrent,
    onPress,
}: {
    label: string;
    current: boolean;
    a11yCurrent: string;
    onPress: () => void;
}) {
    if (current) {
        return (
            <View
                style={styles.hit}
                accessible
                accessibilityRole="text"
                accessibilityLabel={a11yCurrent}
            >
                <Text size="sm" weight="medium" numberOfLines={1}>
                    {label}
                </Text>
            </View>
        );
    }
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            style={styles.hit}
        >
            <Text size="sm" color="primary" numberOfLines={1}>
                {label}
            </Text>
        </Pressable>
    );
}

/**
 * 顶部面包屑：常用位置 › … › 当前目录；横向可滚、内容变化滚到末尾、点祖先段回跳
 * onNavigate(index)：-1 回常用位置（根），否则裁到该层
 */
export function DirectoryBreadcrumb({
    stack,
    onNavigate,
}: {
    stack: readonly DirEntry[];
    onNavigate: (index: number) => void;
}) {
    const t = useT();
    const colors = useColors();
    const scrollRef = useRef<ScrollView>(null);
    // 存储根（带卷身份的那一项）的名交 i18n / 系统卷名；子目录用其真实名
    const segmentLabel = (entry: DirEntry): string =>
        entry.volume ? storageRootLabel(entry, t) : entry.name;
    return (
        <View style={[styles.bar, { borderBottomColor: colors.border }]}>
            <ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.content}
                onContentSizeChange={() =>
                    scrollRef.current?.scrollToEnd({ animated: true })
                }
            >
                <Crumb
                    label={t('scanSettings.picker.commonLocations')}
                    current={stack.length === 0}
                    a11yCurrent={t('scanSettings.picker.a11y.currentFolder', {
                        name: t('scanSettings.picker.commonLocations'),
                    })}
                    onPress={() => onNavigate(-1)}
                />
                {stack.map((entry, i) => {
                    const label = segmentLabel(entry);
                    return (
                        <View key={entry.path} style={styles.group}>
                            <Icon
                                name="chevron-right"
                                size="sm"
                                color="textDisabled"
                            />
                            <Crumb
                                label={label}
                                current={i === stack.length - 1}
                                a11yCurrent={t(
                                    'scanSettings.picker.a11y.currentFolder',
                                    { name: label },
                                )}
                                onPress={() => onNavigate(i)}
                            />
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    bar: { borderBottomWidth: borderWidth.hairline },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingHorizontal: space.lg,
    },
    group: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
    },
    hit: {
        minHeight: layout.hitTarget,
        justifyContent: 'center',
        paddingHorizontal: space.xs,
    },
});
