import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { Checkbox } from '@/components/ui/Checkbox';
import { Icon } from '@/components/ui/Icon';
import { IconButton, iconButtonEdgeInset } from '@/components/ui/IconButton';
import { Switch } from '@/components/ui/Switch';
import { Text } from '@/components/ui/Text';
import {
    capabilitiesOf,
    pluginManager,
    usePluginAlternative,
    usePluginEnabled,
} from '@/core/plugin';
import {
    borderWidth,
    duration,
    easing,
    layout,
    opacity,
    space,
    useColors,
} from '@/design';
import { useT } from '@/i18n';
import { showPluginDescriptionPanel } from '@/widgets/overlays/PluginDescriptionPanel';
import { showPluginDetailsPanel } from '@/widgets/overlays/PluginDetailsPanel';

import type { Plugin } from '@/core/plugin';

interface SortingRowProps {
    mode: 'sorting';
    plugin: Plugin;
    /** 从 1 开始的行号 */
    position: number;
    isFirst: boolean;
    isLast: boolean;
    onMove: (platform: string, op: 'top' | 'up' | 'down') => void;
}

interface SelectingRowProps {
    mode: 'selecting';
    plugin: Plugin;
    selected: boolean;
    onToggle: (platform: string) => void;
}

type PluginRowProps =
    | {
          plugin: Plugin;
          mode?: 'normal';
          /** 从 1 开始的行号（左侧常驻序号槽） */
          position: number;
          onLongPress?: (platform: string) => void;
          /** 短按行为：缺省开详情面板；平板横屏由页面接管为「选中、右栏常驻显示详情」 */
          onPress?: (platform: string) => void;
          /** 平板横屏：当前右栏正在显示的那一行高亮 */
          selected?: boolean;
      }
    | SortingRowProps
    | SelectingRowProps;

/** 行主体：platform、版本与作者、能力摘要或错误状态，以及替代源状态；normal 和 sorting 共用 */
function RowBodyView({
    plugin,
    pointerEvents,
}: {
    plugin: Plugin;
    pointerEvents?: 'none' | 'auto';
}) {
    const t = useT();
    const alternative = usePluginAlternative(plugin.platform);
    const meta = [plugin.version, plugin.author].filter(Boolean).join(' · ');
    const isError = plugin.state === 'error';
    // 能力合并为一行并由 numberOfLines 截断，完整清单在详情面板中展示
    const summary = capabilitiesOf(plugin.supportedMethods)
        .map(capability => t(`pluginManager.capability.${capability}`))
        .join(' · ');
    return (
        <View style={styles.body} pointerEvents={pointerEvents}>
            <Text size="lg" weight="medium" numberOfLines={1}>
                {plugin.platform}
            </Text>
            <View style={styles.info}>
                {meta ? (
                    <Text size="sm" color="textSecondary" numberOfLines={1}>
                        {meta}
                    </Text>
                ) : null}
                {isError ? (
                    <View style={styles.statusLine}>
                        <Icon name="triangle-alert" size="sm" color="danger" />
                        <Text
                            size="sm"
                            color="danger"
                            numberOfLines={1}
                            style={styles.statusText}
                        >
                            {t(
                                plugin.errorReason === 'versionMismatch'
                                    ? 'pluginManager.installResult.versionMismatch'
                                    : 'pluginManager.installResult.parseError',
                            )}
                        </Text>
                    </View>
                ) : (
                    <Text size="sm" color="textSecondary" numberOfLines={1}>
                        {summary || t('pluginManager.noCapabilities')}
                    </Text>
                )}
                {alternative ? (
                    <View style={styles.statusLine}>
                        <Icon
                            name="corner-down-right"
                            size="sm"
                            color="textSecondary"
                        />
                        <Text
                            size="sm"
                            color="textSecondary"
                            numberOfLines={1}
                            style={styles.statusText}
                        >
                            {t('pluginManager.redirectStatus', {
                                name: alternative,
                            })}
                        </Text>
                    </View>
                ) : null}
            </View>
        </View>
    );
}

/** 记忆化行主体：重排或切换 Switch 时 plugin 未变则跳过重新计算 */
const RowBody = memo(RowBodyView);

/** 排序态行：行号、共享主体和置顶/上移/下移按钮；首行或末行的无效按钮仍保留占位 */
function SortingRow({
    plugin,
    position,
    isFirst,
    isLast,
    onMove,
}: SortingRowProps) {
    const t = useT();
    const colors = useColors();
    return (
        <View
            style={[
                styles.unit,
                {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                },
            ]}
        >
            <View style={styles.sortRow}>
                <View style={styles.leading}>
                    <Text
                        size="lg"
                        color="textSecondary"
                        style={styles.position}
                    >
                        {position}
                    </Text>
                </View>
                <RowBody plugin={plugin} />
                <View style={styles.sortControls}>
                    <IconButton
                        icon="arrow-up-to-line"
                        tone="textSecondary"
                        disabled={isFirst}
                        onPress={() => onMove(plugin.platform, 'top')}
                        accessibilityLabel={t(
                            'pluginManager.sorting.a11y.moveTop',
                        )}
                    />
                    <IconButton
                        icon="chevron-up"
                        tone="textSecondary"
                        disabled={isFirst}
                        onPress={() => onMove(plugin.platform, 'up')}
                        accessibilityLabel={t(
                            'pluginManager.sorting.a11y.moveUp',
                        )}
                    />
                    <IconButton
                        icon="chevron-down"
                        tone="textSecondary"
                        disabled={isLast}
                        onPress={() => onMove(plugin.platform, 'down')}
                        accessibilityLabel={t(
                            'pluginManager.sorting.a11y.moveDown',
                        )}
                    />
                </View>
            </View>
        </View>
    );
}

/** 多选态行：行首复选框加共享主体；整行短按切换选中，选中时背景高亮 */
function SelectingRow({ plugin, selected, onToggle }: SelectingRowProps) {
    const colors = useColors();
    return (
        <Pressable
            onPress={() => onToggle(plugin.platform)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={plugin.platform}
            style={[
                styles.unit,
                {
                    backgroundColor: selected
                        ? colors.primarySoft
                        : colors.surface,
                    borderTopColor: colors.border,
                },
            ]}
        >
            <View style={styles.selectRow}>
                <View style={styles.leading}>
                    <Checkbox checked={selected} />
                </View>
                <RowBody plugin={plugin} />
            </View>
        </Pressable>
    );
}

/** 常态行：整行短按打开详情，长按进入多选，右侧说明和 Switch 控件分别处理点击 */
function NormalRow({
    plugin,
    position,
    onLongPress,
    onPress,
    selected = false,
}: {
    plugin: Plugin;
    position: number;
    onLongPress?: (platform: string) => void;
    onPress?: (platform: string) => void;
    selected?: boolean;
}) {
    const t = useT();
    const colors = useColors();
    const enabled = usePluginEnabled(plugin.platform);
    // 按压主体渐降到 opacity.pressed（不改色相）；控件区不触发，各自反馈
    const press = useSharedValue(0);
    const contentStyle = useAnimatedStyle(() => ({
        opacity: 1 - press.value * (1 - opacity.pressed),
    }));
    const hasDescription = Boolean(plugin.description?.trim());

    return (
        <View
            style={[
                styles.unit,
                {
                    backgroundColor: selected
                        ? colors.primarySoft
                        : colors.surface,
                    borderTopColor: colors.border,
                },
            ]}
        >
            {/* 垫底热区：铺满、点击穿透到此开详情；按压时主体渐降到 opacity.pressed（不改色相） */}
            <Pressable
                onPress={() =>
                    onPress
                        ? onPress(plugin.platform)
                        : showPluginDetailsPanel({ platform: plugin.platform })
                }
                accessibilityState={selected ? { selected } : undefined}
                onLongPress={
                    onLongPress ? () => onLongPress(plugin.platform) : undefined
                }
                onPressIn={() => {
                    press.value = withTiming(1, {
                        duration: duration.fast,
                        easing: easing.standard,
                    });
                }}
                onPressOut={() => {
                    press.value = withTiming(0, {
                        duration: duration.fast,
                        easing: easing.standard,
                    });
                }}
                accessibilityRole="button"
                accessibilityLabel={plugin.platform}
                accessibilityHint={t('pluginManager.a11y.openDetails')}
                style={StyleSheet.absoluteFill}
            />
            <Animated.View
                style={[styles.content, contentStyle]}
                pointerEvents="box-none"
            >
                <View style={styles.leading} pointerEvents="none">
                    <Text
                        size="lg"
                        color="textSecondary"
                        style={styles.position}
                    >
                        {position}
                    </Text>
                </View>
                <RowBody plugin={plugin} pointerEvents="none" />
                <View style={styles.controls} pointerEvents="box-none">
                    {hasDescription ? (
                        <IconButton
                            icon="circle-help"
                            tone="textSecondary"
                            onPress={() =>
                                showPluginDescriptionPanel({
                                    platform: plugin.platform,
                                })
                            }
                            accessibilityLabel={t(
                                'pluginManager.a11y.viewUsage',
                                { name: plugin.platform },
                            )}
                        />
                    ) : null}
                    <Switch
                        checked={enabled}
                        onChange={value =>
                            pluginManager.setEnabled(plugin.platform, value)
                        }
                        accessibilityLabel={t(
                            'pluginManager.a11y.enablePlugin',
                            {
                                name: plugin.platform,
                            },
                        )}
                    />
                </View>
                {/* 可进入提示：淡 chevron，点击穿透到主体开详情（非独立控件） */}
                <View style={styles.enter} pointerEvents="none">
                    <Icon
                        name="chevron-right"
                        size="sm"
                        color="textSecondary"
                    />
                </View>
            </Animated.View>
        </View>
    );
}

function PluginRowView(props: PluginRowProps) {
    if (props.mode === 'sorting') {
        return <SortingRow {...props} />;
    }
    if (props.mode === 'selecting') {
        return <SelectingRow {...props} />;
    }
    return (
        <NormalRow
            plugin={props.plugin}
            position={props.position}
            onLongPress={props.onLongPress}
            onPress={props.onPress}
            selected={props.selected}
        />
    );
}

/** 插件单元：normal 态提供说明/Switch/详情入口，sorting 态提供行号与排序操作，selecting 态提供复选框多选 */
export const PluginRow = memo(PluginRowView);

const styles = StyleSheet.create({
    unit: {
        borderTopWidth: borderWidth.hairline,
    },
    sortRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingLeft: layout.screenGutter,
        /** 右侧是贴边排序图标按钮，外推后图标本体落回内容线 */
        paddingRight: iconButtonEdgeInset(layout.screenGutter),
        paddingVertical: space.lg,
    },
    selectRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.lg,
    },
    leading: {
        width: space.xl,
        flexShrink: 0,
        alignItems: 'center',
        alignSelf: 'center',
    },
    position: {
        fontVariant: ['tabular-nums'],
    },
    sortControls: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.lg,
    },
    body: {
        flex: 1,
    },
    info: {
        marginTop: space.sm,
        gap: space.xs,
    },
    // Switch 壳 48 高于标题行：上提让控件与标题视觉居中，且不撑大 body 的对称留白
    controls: {
        marginTop: -space.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
    },
    enter: {
        alignSelf: 'center',
    },
    statusLine: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
    },
    statusText: {
        flex: 1,
    },
});
