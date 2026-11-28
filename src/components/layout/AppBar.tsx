/**
 * 页面头部导航条（纯 UI，导航无关）：吸顶部安全区、标题左对齐单行、
 * leading 恒占 44 位、trailing 行内动作 + 可选溢出 ⋮
 * 底部用 1px 描边分隔（非 elevation：AppBar 是锚定 chrome、不是浮层）
 * 溢出仅渲染 ⋮ 触发器，具体弹什么由调用方接（不认识 ActionSheet，保持分层）
 */
import { type ReactNode } from 'react';
import {
    Pressable,
    StyleSheet,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePressAnimation } from '@/components/hooks/usePressAnimation';
import { IconButton, iconButtonEdgeInset } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import {
    borderWidth,
    layout,
    opacity,
    pressScale,
    space,
    useColors,
} from '@/design';
import { useCompactHeight } from '@/hooks/useCompactHeight';
import { useLayoutClass } from '@/hooks/useLayoutClass';
import { useT } from '@/i18n';

import { appBarRowStyleFor } from './appBarLayout';

import type { IconName } from '@/components/ui/icons.generated';
import type { ContentColumnKind } from '@/hooks/useContentColumn';

/** 行内边距：两端图标按钮外推后，图标本体落在内容线上 */
const ROW_INSET = iconButtonEdgeInset(layout.screenGutter);

/** 行的共有排布；两档行高各自 spread 出一份静态样式 */
const ROW_BASE = {
    flexDirection: 'row',
    alignItems: 'center',
    /** 两端子元素都是图标按钮 / 文字动作，外推后图标本体才落在内容线上 */
    paddingHorizontal: ROW_INSET,
} as const;

type AppBarActionTone = 'text' | 'textSecondary' | 'primary' | 'danger';

export interface AppBarIconAction {
    icon: IconName;
    /** 无障碍 label，兼作 IconButton 的 accessibilityLabel */
    label: string;
    onPress: () => void;
    disabled?: boolean;
    tone?: AppBarActionTone;
}

export interface AppBarTextAction {
    /** 显示文本，兼作 accessibilityLabel */
    label: string;
    onPress: () => void;
    disabled?: boolean;
    /** 缺省 primary（完成 / 搜索这类肯定动作） */
    tone?: AppBarActionTone;
}

/** 行内动作：图标或文字（靠有无 icon 判别） */
type AppBarAction = AppBarIconAction | AppBarTextAction;

interface AppBarOverflowAction {
    onPress: () => void;
    /** 默认 t('common.more') */
    label?: string;
    disabled?: boolean;
}

interface AppBarProps {
    /** 标题；与 center 二选一，都不给则中间留空 */
    title?: string;
    /** 中间自定义内容（如搜索输入框）；给了则取代 title 占据 flex:1 */
    center?: ReactNode;
    /** 缺省=不渲染图标，但仍占 44 位（标题起始横坐标跨页面稳定） */
    leading?: AppBarIconAction;
    /** 行内常驻动作（图标 | 文字）；哪些放这、哪些收进 overflow 由调用方按频率分级 */
    actions?: AppBarAction[];
    /** 溢出 ⋮：给了才渲染，按下调用方自行唤起 ActionSheet 等 */
    overflow?: AppBarOverflowAction;
    /**
     * 平板上行内内容对齐到哪一档内容列（reading 680 / list 840）：单列页传、分栏页不传
     * 栏本身恒通栏铺色；只影响行内元素的横向位置。手机上无效果
     */
    contentWidth?: ContentColumnKind;
    style?: StyleProp<ViewStyle>;
}

/** 文字动作按钮：tone 着色文本 + 44 命中区，按压 / 禁用反馈对齐 IconButton */
function AppBarTextButton({ action }: { action: AppBarTextAction }) {
    const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(
        pressScale.compact,
    );
    const tone = action.tone ?? 'primary';
    const isNeutral = tone === 'text' || tone === 'textSecondary';
    const color = action.disabled && isNeutral ? 'textDisabled' : tone;
    return (
        <Pressable
            onPress={action.disabled ? undefined : action.onPress}
            onPressIn={action.disabled ? undefined : onPressIn}
            onPressOut={action.disabled ? undefined : onPressOut}
            disabled={action.disabled}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityState={{ disabled: action.disabled ?? false }}
            style={[
                styles.textAction,
                action.disabled && !isNeutral
                    ? { opacity: opacity.disabled }
                    : null,
            ]}
        >
            <Animated.View style={action.disabled ? undefined : animatedStyle}>
                <Text size="md" weight="medium" color={color}>
                    {action.label}
                </Text>
            </Animated.View>
        </Pressable>
    );
}

/** 页面头部导航条 */
export function AppBar({
    title,
    center,
    leading,
    actions,
    overflow,
    contentWidth,
    style,
}: AppBarProps) {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const t = useT();
    const layoutClass = useLayoutClass();
    // 平板：行内内容对齐到内容列（手机恒 undefined → 仍传原来的 styles.row 单值，prop 也一字不变）
    const rowLayout = appBarRowStyleFor(layoutClass, contentWidth);
    // 矮窗（手机横屏）换矮档行高。两档都是静态样式，不按帧拼 { height } 字面量
    const rowBase = useCompactHeight() ? styles.rowCompact : styles.row;
    // 无尾部动作时 center 右侧无物可靠，需自补到内容线（填充型 center 如首页搜索 pill 尤其明显）
    const hasTrailing = (actions?.length ?? 0) > 0 || overflow != null;
    return (
        <View
            style={[
                styles.container,
                {
                    paddingTop: insets.top,
                    backgroundColor: colors.surface,
                    borderBottomColor: colors.border,
                },
                style,
            ]}
        >
            <View style={rowLayout ? [rowBase, rowLayout] : rowBase}>
                <View style={styles.leading}>
                    {leading ? (
                        <IconButton
                            icon={leading.icon}
                            accessibilityLabel={leading.label}
                            onPress={leading.onPress}
                            disabled={leading.disabled}
                            tone={leading.tone}
                        />
                    ) : null}
                </View>
                <View
                    style={[
                        styles.center,
                        hasTrailing ? null : styles.centerToGutter,
                    ]}
                >
                    {center ??
                        (title != null ? (
                            <Text
                                size="lg"
                                weight="bold"
                                numberOfLines={1}
                                style={styles.title}
                            >
                                {title}
                            </Text>
                        ) : null)}
                </View>
                {actions?.map(action =>
                    'icon' in action ? (
                        <IconButton
                            key={action.label}
                            icon={action.icon}
                            accessibilityLabel={action.label}
                            onPress={action.onPress}
                            disabled={action.disabled}
                            tone={action.tone}
                        />
                    ) : (
                        <AppBarTextButton key={action.label} action={action} />
                    ),
                )}
                {overflow ? (
                    <IconButton
                        icon="ellipsis-vertical"
                        accessibilityLabel={overflow.label ?? t('common.more')}
                        onPress={overflow.onPress}
                        disabled={overflow.disabled}
                    />
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderBottomWidth: borderWidth.hairline,
    },
    row: { ...ROW_BASE, height: layout.appBarHeight },
    /** 矮窗档：只换高度，内容线与排布不变 */
    rowCompact: { ...ROW_BASE, height: layout.appBarCompactHeight },
    leading: {
        width: layout.hitTarget,
        alignItems: 'center',
        justifyContent: 'center',
    },
    center: {
        flex: 1,
    },
    /** 无尾部动作时把 center 自身补到内容线（填充型 center 不能贴到壳边距上） */
    centerToGutter: {
        marginRight: layout.screenGutter - ROW_INSET,
    },
    title: {
        /** 接在 leading 槽(44)之后固定留白，标题起点 = ROW_INSET + hitTarget + lg */
        marginLeft: space.lg,
    },
    textAction: {
        minWidth: layout.hitTarget,
        height: layout.hitTarget,
        /** 贴边时文字也要落在内容线：ROW_INSET + md = screenGutter */
        paddingHorizontal: space.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
