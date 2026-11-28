import { type StyleProp, type ViewStyle } from 'react-native';

import { iconSize, useColors, type Colors } from '@/design';

import { iconMap, type IconName } from './icons.generated';

interface IconProps {
    name: IconName;
    /** 尺寸 token 档位或原始 dp（默认 md=20） */
    size?: keyof typeof iconSize | number;
    /** 语义颜色 token 优先；也可传原始色值临时 override（默认 text） */
    color?: keyof Colors | (string & {});
    /** 透传样式：定位/边距等 */
    style?: StyleProp<ViewStyle>;
    /** 给了 = 承载语义（读屏朗读）；不给 = 装饰性（读屏跳过） */
    accessibilityLabel?: string;
}

// stroke 分桶：小图标描边略粗、大图标略细，维持视觉重量一致
function strokeFor(px: number): number {
    if (px <= 16) {
        return 2.25;
    }
    if (px <= 24) {
        return 2;
    }
    return 1.5;
}

/** 图标原子：纯字形（无命中区/按压，可点场景用 IconButton）。Lucide + currentColor 语义上色 */
export function Icon({
    name,
    size = 'md',
    color = 'text',
    style,
    accessibilityLabel,
}: IconProps) {
    const colors = useColors();
    const px = typeof size === 'number' ? size : iconSize[size];
    const resolved = color in colors ? colors[color as keyof Colors] : color;
    const SvgIcon = iconMap[name];
    const a11y = accessibilityLabel
        ? {
              accessible: true,
              accessibilityRole: 'image' as const,
              accessibilityLabel,
          }
        : {
              accessibilityElementsHidden: true,
              importantForAccessibility: 'no-hide-descendants' as const,
          };
    return (
        <SvgIcon
            width={px}
            height={px}
            color={resolved}
            strokeWidth={strokeFor(px)}
            style={style}
            {...a11y}
        />
    );
}
