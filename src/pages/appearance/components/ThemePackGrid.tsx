import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { borderWidth, layout, radius, space, useColors } from '@/design';
import {
    gridColumnsForAvailable,
    useGridColumns,
} from '@/hooks/useGridColumns';
import { useLayoutClass } from '@/hooks/useLayoutClass';
import { useT } from '@/i18n';

import { themePackName } from '../lib/themePackName';

import {
    THEME_PACK_CARD_HEIGHT,
    ThemePackCard,
    type ThemePackBadge,
} from './ThemePackCard';

import type { IconName } from '@/components/ui/icons.generated';
import type { ThemePack, ThemeSelection } from '@/core/theme';

interface ThemePackGridProps {
    /** 内置在前、用户主题在后的完整清单 */
    packs: readonly ThemePack[];
    selection: ThemeSelection;
    onSelect(packId: string): void;
    onOpenMenu(packId: string): void;
    onCreate(): void;
}

/** 主题卡的理想格宽：手机上算出来恰好是三列（适配前的硬编码值） */
const THEME_CARD_IDEAL_WIDTH = 120;

/** 主题网格：内置 + 用户主题 + 新建入口；点选即用、长按开菜单 */
function ThemePackGrid({
    packs,
    selection,
    onSelect,
    onOpenMenu,
    onCreate,
}: ThemePackGridProps) {
    // 等权卡片：宽屏加列铺满；手机上算出来仍是三列
    const windowColumns = useGridColumns(THEME_CARD_IDEAL_WIDTH, 3);
    const layoutClass = useLayoutClass();

    const colors = useColors();
    const t = useT();
    const [gridWidth, setGridWidth] = useState(0);
    // 三列定宽：百分比宽度与 gap 混用在 RN 上取整不稳，实测容器宽再均分。
    // onLayout 量的是含内边距的外框，必须先扣掉两侧 gutter 才是可放卡片的内容宽——
    // 少扣这一段，三张卡加间距就会超出内容区、被挤成一行两张。
    // 再向下取整，免得亚像素余量让第三张换行
    const contentWidth = gridWidth - layout.screenGutter * 2;
    // 平板上网格坐在限宽的阅读列里，列数得按量到的列宽算、不能按窗口宽（否则 1280 宽的
    // 窗口会往 680 的列里塞十列）；手机沿用按窗口算的旧路径，结果与今天一致
    const columns =
        layoutClass !== 'phone' && contentWidth > 0
            ? gridColumnsForAvailable(contentWidth, THEME_CARD_IDEAL_WIDTH, 3)
            : windowColumns;
    const cardWidth =
        contentWidth > 0
            ? Math.floor((contentWidth - space.sm * (columns - 1)) / columns)
            : undefined;

    return (
        <View
            style={styles.grid}
            onLayout={event => setGridWidth(event.nativeEvent.layout.width)}
        >
            {cardWidth === undefined
                ? null
                : packs.map(pack => {
                      const badges = badgesOf(selection, pack.id);
                      const name = themePackName(pack, t);
                      return (
                          <ThemePackCard
                              key={pack.id}
                              pack={pack}
                              name={name}
                              width={cardWidth}
                              badges={badges}
                              badgeIcon={badgeIcon(badges)}
                              onPress={() => onSelect(pack.id)}
                              onLongPress={() => onOpenMenu(pack.id)}
                              accessibilityLabel={t(
                                  'appearance.a11y.themePack',
                                  {
                                      name,
                                      binding: bindingLabel(badges, t),
                                  },
                              )}
                          />
                      );
                  })}
            {cardWidth === undefined ? null : (
                <Pressable
                    onPress={onCreate}
                    accessibilityRole="button"
                    accessibilityLabel={t('appearance.theme.create')}
                    style={[
                        styles.createCard,
                        {
                            width: cardWidth,
                            borderColor: colors.border,
                        },
                    ]}
                >
                    <Icon name="plus" size="md" color="primary" />
                    <Text size="sm" weight="medium" color="primary">
                        {t('appearance.theme.create')}
                    </Text>
                </Pressable>
            )}
        </View>
    );
}

function badgesOf(
    selection: ThemeSelection,
    packId: string,
): readonly ThemePackBadge[] {
    if (selection.kind === 'fixed') {
        return selection.packId === packId ? ['current'] : [];
    }
    const badges: ThemePackBadge[] = [];
    if (selection.dayPackId === packId) {
        badges.push('day');
    }
    if (selection.nightPackId === packId) {
        badges.push('night');
    }
    return badges;
}

/**
 * 徽标图标：固定模式用勾，跟随系统时用日 / 月
 * 日夜绑同一套时合成一个 `sun-moon`——两个字形并排在 20dp 的药丸里太挤，
 * 而复用勾会抹掉「它绑在两个槽上」这个信息，用户接下来要改其中一个槽时正需要它
 */
function badgeIcon(badges: readonly ThemePackBadge[]): IconName | undefined {
    if (badges.includes('current')) {
        return 'check';
    }
    const day = badges.includes('day');
    const night = badges.includes('night');
    if (day && night) {
        return 'sun-moon';
    }
    if (day) {
        return 'sun';
    }
    return night ? 'moon' : undefined;
}

/** 徽标语义交给读屏：图标本身读不出来，绑定关系又是这张卡最要紧的信息 */
function bindingLabel(
    badges: readonly ThemePackBadge[],
    t: ReturnType<typeof useT>,
): string {
    if (badges.includes('current')) {
        return t('appearance.a11y.bindingCurrent');
    }
    const day = badges.includes('day');
    const night = badges.includes('night');
    if (day && night) {
        return t('appearance.a11y.bindingBoth');
    }
    if (day) {
        return t('appearance.a11y.bindingDay');
    }
    return night ? t('appearance.a11y.bindingNight') : '';
}

const styles = StyleSheet.create({
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: space.sm,
        paddingHorizontal: layout.screenGutter,
    },
    createCard: {
        // 与主题卡共用同一个高度常量；早先用 aspectRatio 反推，列宽一变就对不上
        height: THEME_PACK_CARD_HEIGHT,
        borderRadius: radius.md,
        borderWidth: borderWidth.hairline,
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xs,
    },
});

export { ThemePackGrid };
