import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { space, type iconSize } from '@/design';
import { useT } from '@/i18n';

import { Spinner } from './Spinner';
import { Text } from './Text';

interface LoadingProps {
    /** 默认 inline */
    variant?: 'inline' | 'fullscreen';
    /** 覆盖该 variant 的默认 spinner 尺寸（一般不需要） */
    size?: keyof typeof iconSize;
    /** 可选文案；默认不显示，需显式传入 */
    label?: string;
    style?: StyleProp<ViewStyle>;
}

/** 加载指示：inline 行内融入、fullscreen 独占容器居中 */
export function Loading({
    variant = 'inline',
    size,
    label,
    style,
}: LoadingProps) {
    const t = useT();
    const fullscreen = variant === 'fullscreen';
    const spinnerSize = size ?? (fullscreen ? '2xl' : 'sm');
    const spinnerColor = fullscreen ? 'primary' : 'textSecondary';
    return (
        <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={label ?? t('common.loading')}
            accessibilityLiveRegion="polite"
            style={[fullscreen ? styles.fullscreen : styles.inline, style]}
        >
            <Spinner size={spinnerSize} color={spinnerColor} />
            {label ? (
                <Text
                    size={fullscreen ? 'md' : 'sm'}
                    color="textSecondary"
                    style={fullscreen ? styles.fullscreenLabel : undefined}
                >
                    {label}
                </Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    inline: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
    },
    fullscreen: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fullscreenLabel: {
        marginTop: space.md,
    },
});
