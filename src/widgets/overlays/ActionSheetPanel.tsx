/**
 * 底部动作表（组合内容，非壳）：走 Panel 壳的一列 ActionRow
 * 点 backdrop / 返回键 = 取消（沿用 Panel 统一交互），不加独立取消行
 * 行容器贴边渲染（按压/分隔线通栏）；标题与行内容各自补回标准横向内距
 */
import { StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { definePanel } from '@/components/overlay';
import { PanelRow } from '@/components/ui/PanelRow';
import { Text } from '@/components/ui/Text';
import { space } from '@/design';

import type { OverlayProps } from '@/components/overlay';
import type { IconName } from '@/components/ui/icons.generated';

export interface ActionSheetItem {
    /** 可选：弱语义动作不强制配图标 */
    icon?: IconName;
    label: string;
    onPress: () => void;
    /** 单选菜单标记当前项：尾部显示 ✓（音质 / 倍速 picker 用） */
    selected?: boolean;
    /** 行尾当前值（如「音质 · 超高」）；纯动作行不传 */
    value?: string;
    /**
     * 该项是开关而非一次性动作：读屏改报 togglebutton + 已选中 / 未选中
     * 只给 `selected` 时读屏在关态什么都不报，与页内工具行的口径不一致
     */
    toggle?: boolean;
    /** 危险项：图标+文案切 danger 色（红字不红底） */
    danger?: boolean;
    /** 前置条件未满足时置灰并禁止点击；仍保留占位以维持菜单结构 */
    disabled?: boolean;
    /** 该项前插 1px 分组分隔线 */
    separatorBefore?: boolean;
}

export interface ActionSheetOptions {
    /** 缺省=不显示；页面级溢出菜单通常不传，条目级上下文菜单传条目名 */
    title?: string;
    items: ActionSheetItem[];
}

function ActionSheetPanelView({
    payload,
    close,
}: OverlayProps<ActionSheetOptions, void>) {
    const onSelect = (item: ActionSheetItem) => {
        close();
        item.onPress();
    };
    // 有任一项带图标才为无图标项保留图标槽（保持文案对齐）；全无图标（如音质 / 倍速 picker）则不留槽、贴左
    const hasIcons = payload.items.some(item => item.icon != null);
    return (
        <View style={styles.root}>
            {payload.title ? (
                <Text
                    size="xl"
                    weight="bold"
                    lineHeight="tight"
                    numberOfLines={1}
                    style={styles.title}
                >
                    {payload.title}
                </Text>
            ) : null}
            <ScrollView style={styles.list}>
                {/* key 取下标而非 label：label 可能来自用户命名（主题重名、
                    「创建副本」天然撞名），撞 key 会让 React 复用错行、把选中态
                    画到另一条上。本列表是一次性 payload，全程不重排 / 不过滤，
                    下标即稳定身份 */}
                {payload.items.map((item, index) => (
                    <PanelRow
                        key={index}
                        label={item.label}
                        icon={item.icon}
                        reserveIconSpace={hasIcons}
                        value={item.value}
                        selected={item.selected}
                        toggle={item.toggle}
                        danger={item.danger}
                        disabled={item.disabled}
                        separatorBefore={item.separatorBefore}
                        onPress={() => onSelect(item)}
                    />
                ))}
            </ScrollView>
        </View>
    );
}

/** 底部动作表：`showActionSheetPanel({ items })`；返回 OverlayHandle<void> */
export const showActionSheetPanel = definePanel(ActionSheetPanelView);

const styles = StyleSheet.create({
    root: {
        flexGrow: 1,
        flexShrink: 1,
    },
    title: {
        paddingHorizontal: space.lg,
        marginBottom: space.md,
    },
    list: {
        flexGrow: 1,
        flexShrink: 1,
    },
});
