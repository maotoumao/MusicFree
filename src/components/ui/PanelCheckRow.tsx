import { Pressable, StyleSheet, View } from 'react-native';

import { Checkbox } from '@/components/ui/Checkbox';
import { Text } from '@/components/ui/Text';
import { layout, space } from '@/design';

interface PanelCheckRowProps {
    checked: boolean;
    onPress: () => void;
    label: string;
    /** 次要说明；不传则只有一行 */
    description?: string;
    /** 缺省用 label；需要把行外的上下文一并念出时传 */
    accessibilityLabel?: string;
    accessibilityHint?: string;
}

/** Panel 内的勾选行：整行是命中区，读屏语义由行承载（Checkbox 只是视觉件） */
export function PanelCheckRow({
    checked,
    onPress,
    label,
    description,
    accessibilityLabel,
    accessibilityHint,
}: PanelCheckRowProps) {
    return (
        <Pressable
            onPress={onPress}
            style={styles.row}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityHint={accessibilityHint}
        >
            <Checkbox checked={checked} />
            <View style={styles.copy}>
                <Text>{label}</Text>
                {description ? (
                    <Text size="sm" color="textSecondary">
                        {description}
                    </Text>
                ) : null}
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: layout.hitTarget,
    },
    copy: {
        flex: 1,
    },
});
