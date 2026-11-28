/**
 * 歌词字号面板：横向 4 档（小 / 标准 / 大 / 特大），点选后立即更新全局 config 并预览
 * 字号是全局偏好，不区分单曲；关闭沿用通用面板交互（下滑 / 遮罩 / 返回键），无需确认
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { definePanel } from '@/components/overlay';
import { Text } from '@/components/ui/Text';
import { config, useConfig, type ConfigSchema } from '@/core/config';
import { opacity, radius, space, useColors } from '@/design';
import { useT } from '@/i18n';

/** 歌词字号档位，对应 config 的 `lyric.fontSize` 值 */
type LyricFontSizeLevel = ConfigSchema['lyric.fontSize'];

/** 字号档位的展示顺序，从小到特大 */
const LYRIC_FONT_SIZE_LEVELS = [
    'small',
    'standard',
    'large',
    'xlarge',
] as const satisfies readonly LyricFontSizeLevel[];

function LyricFontSizePanelView() {
    const t = useT();
    const colors = useColors();
    const current = useConfig('lyric.fontSize') ?? 'standard';
    return (
        <View style={styles.root}>
            <Text size="xl" weight="bold" lineHeight="tight">
                {t('lyricFontSizePanel.title')}
            </Text>
            <View
                style={styles.row}
                accessibilityRole="radiogroup"
                accessibilityLabel={t('lyricFontSizePanel.a11y.group')}
            >
                {LYRIC_FONT_SIZE_LEVELS.map(level => {
                    const selected = level === current;
                    const label = t(`lyricFontSizePanel.levels.${level}`);
                    return (
                        <Pressable
                            key={level}
                            onPress={() => config.set('lyric.fontSize', level)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            accessibilityLabel={label}
                            style={({ pressed }) => [
                                styles.cell,
                                {
                                    backgroundColor: selected
                                        ? colors.primary
                                        : colors.surfaceVariant,
                                },
                                pressed && { opacity: opacity.pressed },
                            ]}
                        >
                            <Text
                                size="md"
                                weight="medium"
                                color={selected ? 'onPrimary' : 'text'}
                            >
                                {label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

/** 打开歌词字号面板，点选后立即应用全局偏好 */
export const showLyricFontSizePanel = definePanel<void, void>(
    LyricFontSizePanelView,
);

const styles = StyleSheet.create({
    root: {
        paddingHorizontal: space.lg,
        gap: space.lg,
    },
    row: {
        flexDirection: 'row',
        gap: space.sm,
    },
    // 各格等宽；由行内 stretch 对齐高度，高度由标签字号和上下 padding 撑起
    cell: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        paddingVertical: space.md,
        paddingHorizontal: space.xs,
    },
});
