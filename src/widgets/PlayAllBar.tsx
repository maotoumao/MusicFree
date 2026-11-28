import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { IconButton, iconButtonEdgeInset } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { player } from '@/core/player';
import {
    borderWidth,
    layout,
    opacity,
    radius,
    space,
    useColors,
} from '@/design';
import { useT } from '@/i18n';

import type { MusicItem } from '@/types';

/** 主动作圆点直径：明显小于 sm 控件档，免在 44 行内过重；内含 sm 图标后四周留白 6 */
const PLAY_DOT_SIZE = 28;

interface PlayAllBarProps {
    /** 曲目列表：派生曲数 + 全部播放（内部 player.playAll） */
    musicList: readonly MusicItem[];
    /** 有 → 渲染排序；缺省不渲染 */
    onSort?(): void;
    /** 有 → 渲染批量管理 */
    onMultiSelect?(): void;
    /** 排序置灰（degraded 只读时） */
    sortDisabled?: boolean;
}

/** 全部播放操作条：▶ 全部播放 · N 首（主、内部 player.playAll）+ 排序 / 批量管理（纯图标，按 prop 有无渲染）；跨页共享 */
export function PlayAllBar({
    musicList,
    onSort,
    onMultiSelect,
    sortDisabled,
}: PlayAllBarProps) {
    const t = useT();
    const colors = useColors();
    const count = musicList.length;
    return (
        <View style={[styles.bar, { borderColor: colors.border }]}>
            <Pressable
                onPress={() => player.playAll(musicList).catch(() => {})}
                accessibilityRole="button"
                accessibilityLabel={`${t('playAllBar.playAll')} ${t(
                    'media.songCount',
                    { count },
                )}`}
                style={({ pressed }) => [
                    styles.trigger,
                    pressed ? styles.pressed : null,
                ]}
            >
                <View
                    style={[
                        styles.playDot,
                        { backgroundColor: colors.primary },
                    ]}
                >
                    <Icon name="play" size="xs" color="onPrimary" />
                </View>
                <Text
                    size="md"
                    weight="bold"
                    numberOfLines={1}
                    style={styles.label}
                >
                    {t('playAllBar.playAll')}
                    <Text size="md" weight="medium" color="textSecondary">
                        {` · ${t('media.songCount', { count })}`}
                    </Text>
                </Text>
            </Pressable>
            {onSort ? (
                <IconButton
                    icon="arrow-up-down"
                    accessibilityLabel={t('playAllBar.a11y.sort')}
                    onPress={onSort}
                    disabled={sortDisabled}
                />
            ) : null}
            {onMultiSelect ? (
                <IconButton
                    icon="list-checks"
                    accessibilityLabel={t('playAllBar.a11y.batchManage')}
                    onPress={onMultiSelect}
                />
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingLeft: layout.screenGutter,
        /** 右端是 44 命中壳的 IconButton，外推一个壳内留白让图标本体落在内容线上 */
        paddingRight: iconButtonEdgeInset(layout.screenGutter),
        /** 上下等距：条无自身底色，与上方内容的分隔也由这段内缩承担，不再额外加 marginTop */
        paddingVertical: space.xs,
        borderBottomWidth: borderWidth.hairline,
    },
    trigger: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        minHeight: layout.hitTarget,
        borderRadius: radius.md,
    },
    /** 主色实心圆点：整条上唯一的主动作标记，与右端图标工具拉开层级 */
    playDot: {
        width: PLAY_DOT_SIZE,
        height: PLAY_DOT_SIZE,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pressed: {
        opacity: opacity.pressed,
    },
    label: {
        flex: 1,
    },
});
