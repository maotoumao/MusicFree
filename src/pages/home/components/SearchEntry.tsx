import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressAnimation } from '@/components/hooks/usePressAnimation';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { layout, radius, space, useColors } from '@/design';
import { useT } from '@/i18n';

/** 只读入口视觉高度（组件专属几何）：比 44 命中区略矮，外层 Pressable 擑满命中区 */
const ENTRY_HEIGHT = 36;

/** 只读搜索入口：外观似搜索框，点按进搜索页；44 命中区包 36 视觉胶囊 */
export function SearchEntry({ onPress }: { onPress: () => void }) {
    const t = useT();
    const colors = useColors();
    const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(1);
    return (
        <Pressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            accessibilityRole="button"
            accessibilityLabel={t('home.searchPrompt')}
            style={styles.touch}
        >
            <Animated.View
                style={[
                    styles.pill,
                    { backgroundColor: colors.surfaceVariant },
                    animatedStyle,
                ]}
            >
                <Icon name="search" size="sm" color="textSecondary" />
                <Text
                    size="md"
                    color="textSecondary"
                    numberOfLines={1}
                    style={styles.placeholder}
                >
                    {t('home.searchPrompt')}
                </Text>
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    touch: {
        height: layout.hitTarget,
        justifyContent: 'center',
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        height: ENTRY_HEIGHT,
        paddingHorizontal: space.md,
        borderRadius: radius.full,
        gap: space.sm,
    },
    placeholder: {
        flex: 1,
    },
});
