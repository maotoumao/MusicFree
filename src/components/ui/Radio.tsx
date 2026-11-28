import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { borderWidth, iconSize, radius, useColors } from '@/design';

import { Icon } from './Icon';

interface RadioProps {
    selected: boolean;
    /** 透传样式：定位 / 外边距等 */
    style?: StyleProp<ViewStyle>;
}

/**
 * 单选指示器：Checkbox 的圆形孪生，未选=空心圆，选中=primary 填充 + onPrimary 对勾
 *
 * 纯视觉件，无命中区、无无障碍节点——交互与读屏由所在行承载，该行须同时给出
 * `accessibilityRole="radio"` 与 `accessibilityState={{ checked: selected }}`
 * （radio 语义读的是 `checked` 而非 `selected`：Android 只有前者会设 isCheckable / isChecked）
 */
export function Radio({ selected, style }: RadioProps) {
    const colors = useColors();
    return (
        <View
            style={[
                styles.circle,
                selected
                    ? {
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                      }
                    : { borderColor: colors.border },
                style,
            ]}
        >
            {selected ? (
                <Icon name="check" size="xs" color="onPrimary" />
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    circle: {
        // 与 Checkbox 同边长（图标 md 档），二者在同一列表里换用时不跳位
        width: iconSize.md,
        height: iconSize.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        borderWidth: borderWidth.hairline,
    },
});
