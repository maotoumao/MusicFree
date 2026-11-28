import { useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useHistory } from '@/core/history';
import { borderWidth, opacity, radius, space, useColors } from '@/design';
import { useT } from '@/i18n';
import { firstNonBlank } from '@/utils/text';

/** 卡高（dp）：两行文字 + 图标底 40 上下各留 16 */
const CARD_HEIGHT = 72;
/** 图标底边长（dp）：与类型入口卡同一视觉列 */
const ICON_WELL = 40;
/** 副题里最多列几首最近的歌：一行放得下、又足够让人想起「刚才在听什么」 */
const RECENT_TITLES = 3;

/**
 * 「最近播放」入口：独占一行的通栏卡
 *
 * 它和下面四张类型入口不是一类东西——那四张是「来源 / 类型」，这一张是「时间」。
 * 独占一行有两个收益：五张卡两列排的末行孤卡消失；多出来的宽度正好放一行副题，
 * 列出最近三首的歌名，看一眼就知道点进去能接上什么。
 * 高度恒定（副题单行截断、空历史时给占位文案），作为 FlashList header 不会因数据变化改变高度。
 */
export function HistoryEntryCard() {
    const t = useT();
    const colors = useColors();
    const navigation = useNavigation();
    const history = useHistory();
    // 历史恢复只校验 platform / id，标题可能缺失或空白：逐条回退「未知歌曲」，与媒体行同一规则
    const recent = history
        .slice(0, RECENT_TITLES)
        .map(item => firstNonBlank(item.title) ?? t('media.unknownTitle'))
        .join(' · ');
    const subtitle = recent || t('history.empty');
    return (
        <Pressable
            onPress={() => navigation.navigate('History')}
            accessibilityRole="button"
            accessibilityLabel={t('home.a11y.openHistory')}
            // 最近曲目是这张卡的当前内容而非动作结果：走 value（同 DrawerRow），不拼进 label、不占 hint
            accessibilityValue={{ text: subtitle }}
            style={({ pressed }) => [
                styles.card,
                {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? opacity.pressed : 1,
                },
            ]}
        >
            <View
                style={[
                    styles.iconWell,
                    { backgroundColor: colors.primarySoft },
                ]}
            >
                <Icon name="history" size="md" color="onPrimarySoft" />
            </View>
            <View style={styles.text}>
                <Text size="md" weight="medium" numberOfLines={1}>
                    {t('history.title')}
                </Text>
                <Text size="xs" color="textSecondary" numberOfLines={1}>
                    {subtitle}
                </Text>
            </View>
            <Icon name="chevron-right" size="sm" color="textSecondary" />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        height: CARD_HEIGHT,
        paddingLeft: space.sm,
        paddingRight: space.md,
        borderRadius: radius.md,
        borderWidth: borderWidth.hairline,
    },
    iconWell: {
        width: ICON_WELL,
        height: ICON_WELL,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        flex: 1,
        minWidth: 0,
        gap: space.xs,
    },
});
