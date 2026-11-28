import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressFade } from '@/components/hooks/usePressFade';
import { Radio } from '@/components/ui/Radio';
import { Text } from '@/components/ui/Text';
import { layout, space, useColors } from '@/design';

interface PanelRadioRowProps {
    selected: boolean;
    onPress: () => void;
    label: string;
    /** 尾部次要值（如「上次 90 分钟」）；不传则只有标签 */
    value?: string;
    /** 缺省用 label；需要把行外的上下文一并念出时传 */
    accessibilityLabel?: string;
}

/**
 * Panel 内的单选行：整行是命中区，读屏语义由行承载（Radio 只是视觉件）
 *
 * 指示器后置——单选设置列表的平台惯例，也对齐 PanelRow 的尾部选中标记；
 * PanelCheckRow 的前置勾选框服务的是多选扫读，场景不同故不强求一致
 */
export function PanelRadioRow({
    selected,
    onPress,
    label,
    value,
    accessibilityLabel,
}: PanelRadioRowProps) {
    const colors = useColors();
    const { overlayStyle, onPressIn, onPressOut } = usePressFade();
    return (
        <Pressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            style={styles.row}
            accessibilityRole="radio"
            // radio 语义读 checked 而非 selected：Android 只有前者会设 isCheckable / isChecked
            accessibilityState={{ checked: selected }}
            accessibilityLabel={accessibilityLabel ?? label}
            // 显式 label 会盖掉子树文本，尾部值得单独喂给读屏，否则「上次 90 分钟」不会被念出
            accessibilityValue={
                value !== undefined ? { text: value } : undefined
            }
        >
            {/* 按压覆盖背景：铺满整行、淡入淡出、不拦截触摸 */}
            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: colors.ripple },
                    overlayStyle,
                ]}
            />
            <Text style={styles.label} numberOfLines={1}>
                {label}
            </Text>
            {value !== undefined ? (
                <Text size="sm" color="textSecondary" numberOfLines={1}>
                    {value}
                </Text>
            ) : null}
            <View style={styles.indicator}>
                <Radio selected={selected} />
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        minHeight: layout.hitTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
    },
    label: {
        flex: 1,
    },
    indicator: {
        // 不参与 flex 收缩：标签再长也不挤压指示器
        flexShrink: 0,
    },
});
