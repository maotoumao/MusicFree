import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { space } from '@/design';

import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

import type { IconName } from './icons.generated';

export interface ContentUnavailableProps {
    /** 可选图标（装饰性，恒中性色；空/错的差异由 icon 选型 + 文案表达） */
    icon?: IconName;
    /** 标题（必填） */
    title: string;
    /** 可选补充说明 */
    description?: string;
    /** 可选操作按钮 */
    action?: {
        label: string;
        onPress: () => void;
        icon?: IconName;
    };
    /** 可选次操作（ghost、位于主操作下方，用于「管理范围」等备选路径） */
    secondaryAction?: {
        label: string;
        onPress: () => void;
        icon?: IconName;
    };
    style?: StyleProp<ViewStyle>;
}

/** 内容不可用占位：空数据 / 加载失败等场景的居中说明 + 可选操作，独占容器 */
export function ContentUnavailable({
    icon,
    title,
    description,
    action,
    secondaryAction,
    style,
}: ContentUnavailableProps) {
    return (
        <View style={[styles.container, style]}>
            {icon ? (
                <Icon name={icon} size="3xl" color="textSecondary" />
            ) : null}
            <Text
                size="lg"
                style={[styles.centered, icon ? styles.afterIcon : null]}
            >
                {title}
            </Text>
            {description ? (
                <Text
                    size="md"
                    color="textSecondary"
                    lineHeight="normal"
                    style={styles.description}
                >
                    {description}
                </Text>
            ) : null}
            {action ? (
                <Button
                    size="md"
                    icon={action.icon}
                    onPress={action.onPress}
                    style={styles.action}
                >
                    {action.label}
                </Button>
            ) : null}
            {secondaryAction ? (
                <Button
                    variant="ghost"
                    tone="neutral"
                    size="md"
                    icon={secondaryAction.icon}
                    onPress={secondaryAction.onPress}
                    style={styles.secondaryAction}
                >
                    {secondaryAction.label}
                </Button>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.xl,
    },
    centered: {
        textAlign: 'center',
    },
    afterIcon: {
        marginTop: space.lg,
    },
    description: {
        marginTop: space.xs,
        // 居中换行，避免宽屏单行被拉长、扫视变慢（组件专属几何字面量）
        maxWidth: 280,
        textAlign: 'center',
    },
    action: {
        marginTop: space.xl,
    },
    secondaryAction: {
        marginTop: space.sm,
    },
});
