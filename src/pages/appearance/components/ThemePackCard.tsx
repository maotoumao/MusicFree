import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Image } from '@/components/ui/Image';
import { Text } from '@/components/ui/Text';
import { resolveBackgroundImageUri } from '@/core/theme';
import {
    borderWidth,
    fontSize,
    lineHeightMultiplier,
    radius,
    resolveThemeColors,
    space,
    useColors,
} from '@/design';

import type { IconName } from '@/components/ui/icons.generated';
import type { ThemePack } from '@/core/theme';

/** 卡片右上角的绑定标记：当前 / 日间 / 夜间 */
type ThemePackBadge = 'current' | 'day' | 'night';

interface ThemePackCardProps {
    pack: ThemePack;
    /** 显示名：内置主题由调用方给已翻译文案 */
    name: string;
    width: number;
    badges: readonly ThemePackBadge[];
    /** 角标图标；日夜绑同一套时由调用方合成一个字形 */
    badgeIcon?: IconName;
    onPress(): void;
    onLongPress(): void;
    accessibilityLabel: string;
}

/**
 * 卡片总高定死：新建卡要与它严丝合缝地并排，而卡片高度不该随列宽变
 * = 上下内边距 + 缩览 + 间距 + 一行名称（行高显式给定，不吃字体度量的差异）
 */
const NAME_LINE_HEIGHT = Math.round(fontSize.sm * lineHeightMultiplier.normal);
const THEME_PACK_CARD_HEIGHT =
    space.xs * 3 + 92 + NAME_LINE_HEIGHT + borderWidth.hairline * 2;

/**
 * 单个主题的缩览卡：用该主题**自己**解析出的语义色画一张微缩界面
 * 有背景图时铺其烘焙位图并压同款幕布，卡片即所见
 */
function ThemePackCard({
    pack,
    name,
    width,
    badges,
    badgeIcon,
    onPress,
    onLongPress,
    accessibilityLabel,
}: ThemePackCardProps) {
    const colors = useColors();
    const background = pack.background;
    // 缩览要的是「这套主题长什么样」，与当前生效主题无关，故就地解析而非读全局；
    // 带上控件不透明度，缩览里的顶栏条才与实机一致
    const preview = resolveThemeColors(
        pack.scheme,
        pack.colors,
        background?.surfaceOpacity ?? null,
    );
    const backgroundUri = background
        ? resolveBackgroundImageUri(background.fileName)
        : undefined;
    const selected = badges.length > 0;
    return (
        <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ selected }}
            style={[
                styles.card,
                {
                    width,
                    backgroundColor: colors.surface,
                    borderColor: selected ? colors.primary : colors.border,
                },
            ]}
        >
            <View
                style={[
                    styles.preview,
                    { backgroundColor: preview.background },
                ]}
                importantForAccessibility="no"
            >
                {backgroundUri ? (
                    <>
                        <Image
                            source={backgroundUri}
                            style={StyleSheet.absoluteFill}
                            transition={0}
                            pointerEvents="none"
                        />
                        <View
                            pointerEvents="none"
                            style={[
                                StyleSheet.absoluteFill,
                                {
                                    backgroundColor: preview.background,
                                    opacity: 1 - background!.visibility,
                                },
                            ]}
                        />
                    </>
                ) : null}
                {/* 有壁纸时不画这套微缩控件：壁纸本身就是这套主题的辨识物，
                    压几条色块上去只是把它糊住。无壁纸时它们是唯一的信息来源 */}
                {backgroundUri ? null : (
                    <>
                        <View
                            style={[
                                styles.previewBar,
                                { backgroundColor: preview.surface },
                            ]}
                        />
                        <View style={styles.previewBody}>
                            <View
                                style={[
                                    styles.previewLine,
                                    { backgroundColor: preview.text },
                                ]}
                            />
                            <View
                                style={[
                                    styles.previewLineShort,
                                    { backgroundColor: preview.textSecondary },
                                ]}
                            />
                            <View
                                style={[
                                    styles.previewAccent,
                                    { backgroundColor: preview.primary },
                                ]}
                            />
                        </View>
                    </>
                )}
            </View>
            <Text
                size="sm"
                weight={selected ? 'bold' : 'medium'}
                lineHeight="normal"
                numberOfLines={1}
                style={styles.name}
            >
                {name}
            </Text>
            {/* 语义由卡片的 accessibilityLabel 承载，图标本身是装饰性的 */}
            {selected && badgeIcon ? (
                <View
                    style={[styles.badge, { backgroundColor: colors.primary }]}
                    importantForAccessibility="no"
                >
                    {/* sm 而非 xs：sun 有九条射线、sun-moon 五段路径，14dp 会糊 */}
                    <Icon name={badgeIcon} size="sm" color="onPrimary" />
                </View>
            ) : null}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        height: THEME_PACK_CARD_HEIGHT,
        padding: space.xs,
        borderRadius: radius.md,
        borderWidth: borderWidth.hairline,
        gap: space.xs,
        overflow: 'hidden',
    },
    /** 吃掉名称行之外的全部高度：卡片定高后缩览不必再自带高度 */
    preview: {
        flex: 1,
        borderRadius: radius.sm,
        overflow: 'hidden',
    },
    previewBar: { height: space.sm },
    previewBody: {
        flex: 1,
        justifyContent: 'center',
        gap: space.xs,
        paddingHorizontal: space.xs,
    },
    previewLine: { width: '80%', height: 3, borderRadius: radius.full },
    previewLineShort: { width: '55%', height: 3, borderRadius: radius.full },
    previewAccent: {
        width: '45%',
        height: space.xs,
        borderRadius: radius.full,
        marginTop: space.xs,
    },
    name: { textAlign: 'center' },
    badge: {
        position: 'absolute',
        top: space.sm,
        right: space.sm,
        // 内容恒为一个 xs 图标，故定死方形而非按文字撑开
        width: 20,
        height: 20,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export { ThemePackCard, THEME_PACK_CARD_HEIGHT };
export type { ThemePackBadge };
