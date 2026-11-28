import { type ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressFade } from '@/components/hooks/usePressFade';
import { layout, opacity, space, useColors } from '@/design';

interface ListItemProps {
    /** 前导槽位：序号 / 图标 / 状态指示；不传即不渲染、不占位 */
    leading?: ReactElement;
    /** 主内容：承载标题，可含平台 Tag、播放指示等；文本样式由调用方决定 */
    title: ReactElement;
    /** 次文本行：如「歌手 - 专辑」；文本样式由调用方决定 */
    subtitle?: ReactElement;
    /**
     * 尾部槽位：如更多按钮；作为整行同级、自带独立命中，不触发整行点击
     * 槽位只给内容线内边距，尾部若是贴边图标按钮，由该按钮自带 edgeAlign="end" 外拉
     */
    trailing?: ReactElement;
    /** 尾部改内联进可点主体：跟随整行点击（如选值行的当前值），而非独立命中；默认独立 */
    trailingInline?: boolean;
    /** 选中态（如当前播放行）：使用 primarySoft 作为底色 */
    selected?: boolean;
    /** 密集档：单行文本、需要一屏看更多的列表（如播放队列）用；行更矮、上下内距更小 */
    dense?: boolean;
    onPress?: () => void;
    onLongPress?: () => void;
    /** 整行可点时的读屏名称；标题为组合节点时系统难以自动拼名，调用方应显式传 */
    accessibilityLabel?: string;
    /** 补充说明点按后果（如目的地）；名称已说清时不必传 */
    accessibilityHint?: string;
    /** 该行正在执行耗时操作；读屏据此播报忙碌 */
    busy?: boolean;
    /** 禁用行主体交互，并向读屏播报不可用；独立 trailing 自行管理禁用态 */
    disabled?: boolean;
}

/** 列表行布局：包含前导、标题/副标题和尾部三个槽位；只处理布局、按压反馈和选中态，不依赖业务 */
export function ListItem({
    leading,
    title,
    subtitle,
    trailing,
    trailingInline = false,
    selected = false,
    dense = false,
    onPress,
    onLongPress,
    accessibilityLabel,
    accessibilityHint,
    busy = false,
    disabled = false,
}: ListItemProps) {
    const colors = useColors();
    const { overlayStyle, onPressIn, onPressOut } = usePressFade();
    const interactive = onPress != null || onLongPress != null;

    // 尾部内联 = 跟随整行点击（进主体 Pressable）；否则独立命中（主体外同级）
    const inlineTrailing = trailingInline && trailing != null;
    const externalTrailing = !trailingInline && trailing != null;

    // 主体（前导 + 标题/副标题 [+ 内联尾部]）：此区域可点击；独立尾部与其同级、不嵌套其中
    const bodyInner = (
        <>
            {leading != null ? (
                <View style={styles.leading}>{leading}</View>
            ) : null}
            <View style={styles.content}>
                {title}
                {subtitle != null ? (
                    <View style={styles.subtitle}>{subtitle}</View>
                ) : null}
            </View>
            {inlineTrailing ? (
                <View style={styles.trailingInline}>{trailing}</View>
            ) : null}
        </>
    );

    // 存在独立尾部槽时收窄主体右侧内边距为其留位；内联尾部由主体全内边距统一右 gutter
    const bodyStyle = externalTrailing ? styles.bodyPadEnd : styles.bodyPadFull;

    return (
        <View
            style={[
                styles.row,
                dense ? styles.rowDense : null,
                selected ? { backgroundColor: colors.primarySoft } : null,
                disabled ? { opacity: opacity.disabled } : null,
            ]}
        >
            {/* 按压覆盖背景：铺满整行（含尾部），淡入淡出、不拦截触摸 */}
            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: colors.ripple },
                    overlayStyle,
                ]}
            />
            {interactive ? (
                <Pressable
                    onPress={disabled ? undefined : onPress}
                    onLongPress={disabled ? undefined : onLongPress}
                    onPressIn={disabled ? undefined : onPressIn}
                    onPressOut={disabled ? undefined : onPressOut}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityLabel={accessibilityLabel}
                    accessibilityHint={accessibilityHint}
                    accessibilityState={{ selected, busy, disabled }}
                    style={[
                        styles.body,
                        bodyStyle,
                        dense ? styles.bodyDense : null,
                    ]}
                >
                    {bodyInner}
                </Pressable>
            ) : (
                <View
                    style={[
                        styles.body,
                        bodyStyle,
                        dense ? styles.bodyDense : null,
                    ]}
                >
                    {bodyInner}
                </View>
            )}
            {externalTrailing ? (
                <View style={styles.trailing}>{trailing}</View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'stretch',
        minHeight: layout.listRowMinHeight,
        overflow: 'hidden',
    },
    rowDense: {
        minHeight: layout.listRowDenseMinHeight,
    },
    body: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: space.md,
    },
    bodyDense: {
        paddingVertical: space.sm,
    },
    bodyPadFull: {
        paddingHorizontal: layout.screenGutter,
    },
    bodyPadEnd: {
        paddingLeft: layout.screenGutter,
        paddingRight: space.sm,
    },
    leading: {
        marginRight: space.lg,
    },
    content: {
        flex: 1,
    },
    subtitle: {
        marginTop: space.xs,
    },
    trailing: {
        justifyContent: 'center',
        paddingRight: layout.screenGutter,
    },
    /** 内联尾部：右 gutter 由主体全内边距提供，只需与内容留间距 */
    trailingInline: {
        justifyContent: 'center',
        marginLeft: space.md,
    },
});
