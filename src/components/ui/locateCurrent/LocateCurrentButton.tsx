/**
 * 「定位到当前曲」浮标
 *
 * 位置：列表右下角，浮在列表自己的边界内——MusicBar 是列表的兄弟节点、接在其后，
 * 而浮标只在有当前曲时才可能出现（MusicBar 也正是无当前曲就不渲染），
 * 故浮标能出现的场合底部安全区必由 MusicBar 承接，bottom 量的是列表下缘、不会落进手势区。
 *
 * **水平方向刻意避开行尾的 ⋮**：每行「更多」按钮占最右一个 hitTarget（44dp），
 * 浮标若也贴右边缘就会盖住它，让那一行的 ⋮ 点不准——盖住「另一个按钮」比盖住行身
 * 糟得多（行身剩下的可点面积仍然很大）。故右距 = hitTarget + sm。
 * 实际净间隙是 **4dp** 而非 sm 的 8dp：⋮ 壳右缘并不贴在行内容盒右缘上，而是往里 4dp
 * （ListItem.trailing 的 paddingRight 16 减去 edgeAlign="end" 外拉的 shellPad 12）。
 * 再算上浮标自己 hitSlop 外扩的 2dp，两个命中区净剩 2dp、不重叠
 *
 * 但「右」是**行的右缘**，不是屏幕右缘：宽屏档行会限宽居中（如 780 × 500 收到 640，
 * 每侧留白 70），此时按屏幕右缘算就会压回 ⋮ 上。故本组件接 `rowGutter`——
 * 调用方把行两侧的留白量传进来，浮标据此再往里收。
 *
 * 「与行同轴」是**按数字收内距**实现的，不是靠把行的限宽样式套在浮标上：
 * 那条路走不通——`left: 0` 的绝对定位节点及其子节点上，`maxWidth` 生效而 `alignSelf` 不生效
 * （Yoga 对绝对定位子节点「inline-start inset 已定义就按它落位，永不走对齐分支」，
 * 见 ReactCommon/yoga/yoga/algorithm/AbsoluteLayout.cpp；插一层普通流内壳也没能救回来）。
 * 于是改由 `MediaList` 把**实测**的行留白（列表实宽与行限宽之差的一半）算成 `rowGutter` 传进来，
 * 浮标把它叠加到右内距上，几何由 ui/mediaListLayout.locateGutterFor 算、四档都有断言。
 * 实测钉住过这个坑：670dp 窗口下浮标右缘应在 603（做错时是 588）
 *
 * 淡出后必须 pointerEvents: 'none'：否则会留一个看不见却能点的按钮，比遮挡更糟。
 * 淡**入**那 250ms 里确实存在「近乎透明但可点」的一瞬，这是知情取舍：浮标只在用户
 * 正在滑动时出现，那段时间的触摸基本被滚动容器吃掉，为它再加一个滞后状态不划算
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui/Icon';
import {
    duration,
    easing,
    elevation,
    iconSize,
    layout,
    radius,
    space,
    useColors,
    zIndex,
} from '@/design';
import { useT } from '@/i18n';

/**
 * 浮标圆的视觉直径（dp）
 *
 * 比 hitTarget(44) 小一圈，纯视觉考量——44 的实心圆压在列表上偏重。
 * 差出来的部分由 hitSlop 补回，命中区仍是 44（同 Chip 的做法，见 layout.chipHeight 注释）
 */
const BUTTON_SIZE = 40;

/** hitSlop 每边补的量：把视觉圆补回 hitTarget 的命中区 */
const BUTTON_HIT_SLOP = (layout.hitTarget - BUTTON_SIZE) / 2;

export function LocateCurrentButton({
    visible,
    onPress,
    rowGutter = 0,
}: {
    visible: boolean;
    onPress: () => void;
    /**
     * 行两侧的留白（dp）：行被限宽居中时列表边缘到行边缘的距离，由 `MediaList` 实测算出
     *
     * 浮标据此再往里收，才落在**行的**右缘而不是列表的右缘
     */
    rowGutter?: number;
}) {
    const colors = useColors();
    const t = useT();
    const reduced = useReducedMotion();
    const opacity = useSharedValue(visible ? 1 : 0);

    useEffect(() => {
        const target = visible ? 1 : 0;
        opacity.value = reduced
            ? target
            : withTiming(target, {
                  duration: duration.base,
                  easing: easing.standard,
              });
    }, [visible, reduced, opacity]);

    const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
    // 让开一个 ⋮（最右那个 hitTarget）再加上行两侧的留白
    const rightInset = layout.hitTarget + space.sm + rowGutter;

    return (
        <Animated.View
            style={[styles.root, animated]}
            /*
             * box-none 而非 auto：外层为了与行同宽是**满幅**的，若它自己也能当触摸目标，
             * 就会在列表底部横着吃掉一条 44dp 高的触摸带——滚动后 3s 内点不到最后一行。
             * box-none 让外层永不作目标、只有里面那个按钮（视觉 40、命中区 44）接触摸
             */
            pointerEvents={visible ? 'box-none' : 'none'}
            // 不可见时从无障碍树摘掉：读屏不该聚到一个正在淡出的按钮上
            accessibilityElementsHidden={!visible}
            importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        >
            <View style={[styles.slot, { marginRight: rightInset }]}>
                <Pressable
                    onPress={onPress}
                    hitSlop={BUTTON_HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel={t('mediaList.a11y.locate')}
                    style={[
                        styles.button,
                        {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                            shadowColor: colors.shadow,
                        },
                    ]}
                >
                    <Icon
                        name="locate-fixed"
                        size={iconSize.md}
                        color="primary"
                    />
                </Pressable>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    /** 外层只负责定位：绝对定位贴住列表下缘、满幅铺开，限宽交给中间层 */
    root: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: space.lg,
        zIndex: zIndex.sticky,
    },
    /** 浮标本体：贴列表右缘，再让开一个 ⋮ 的位置（行留白由 rightInset 叠加） */
    slot: {
        alignSelf: 'flex-end',
    },
    button: {
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        borderRadius: radius.full,
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        justifyContent: 'center',
        ...elevation.md,
    },
});
