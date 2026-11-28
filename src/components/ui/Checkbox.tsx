import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { borderWidth, iconSize, radius, useColors } from '@/design';

import { Icon } from './Icon';

interface CheckboxProps {
    checked: boolean;
    /** 透传样式：定位 / 外边距等 */
    style?: StyleProp<ViewStyle>;
}

/**
 * 复选框：纯视觉件，未选=空心方框，选中=primary 填充 + onPrimary 对勾
 * 无命中区、无无障碍角色——交互与读屏由所在行承载（行 accessibilityRole="checkbox"）
 */
export function Checkbox({ checked, style }: CheckboxProps) {
    const colors = useColors();
    return (
        <View
            style={[
                styles.box,
                checked
                    ? {
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                      }
                    : { borderColor: colors.border },
                style,
            ]}
        >
            {checked ? <Icon name="check" size="xs" color="onPrimary" /> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    box: {
        // 方框边长复用图标 md 档，与行内 leading 字形同尺寸
        width: iconSize.md,
        height: iconSize.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        borderWidth: borderWidth.hairline,
    },
});
