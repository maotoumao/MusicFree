import type { ViewStyle } from 'react-native';

type Elevation = Pick<
    ViewStyle,
    'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

/**
 * 高程/阴影几何预设（跨端：iOS shadow* + Android elevation）
 * 不含阴影色：阴影色归语义 `Colors.shadow`，消费时合 `shadowColor: colors.shadow`
 */
export const elevation = {
    sm: {
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 2,
        elevation: 2,
    },
    md: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.16,
        shadowRadius: 6,
        elevation: 4,
    },
    lg: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
    },
} as const satisfies Record<string, Elevation>;
