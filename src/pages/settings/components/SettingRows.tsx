/**
 * 设置行原语：开关 / 单选 / 动作三种尾部语义
 * 直接绑 core/config，故只能作页私有组件（components/ 是纯 UI 层、禁 import core）
 * 三种行都整行可点：尾部一律走 trailingInline 进入行主体 Pressable，行内无死区
 */
import { ListItem } from '@/components/ui/ListItem';
import { Switch } from '@/components/ui/Switch';
import { Text } from '@/components/ui/Text';
import { config, useConfig } from '@/core/config';
import { useT } from '@/i18n';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';

import type { ConfigKey, ConfigSchema } from '@/core/config';
import type { ReactElement } from 'react';

/** 值为布尔的配置键：SwitchRow 只收这些 */
type BooleanConfigKey = {
    [K in ConfigKey]: ConfigSchema[K] extends boolean ? K : never;
}[ConfigKey];

/**
 * 值为标量的配置键：ChoiceRow 只收这些
 * 结构值（数组 / 对象）经 MMKV 每次反序列化出新引用，`===` 恒假、永远选不中当前档
 */
type ScalarConfigKey = {
    [K in ConfigKey]: ConfigSchema[K] extends string | number | boolean
        ? K
        : never;
}[ConfigKey];

/** 副标题：只在后果无法从标题直接推断时给（如「关闭时自动跳到下一首」） */
function subtitleOf(text: string | undefined): ReactElement | undefined {
    return text === undefined ? undefined : (
        <Text size="sm" color="textSecondary">
            {text}
        </Text>
    );
}

interface ControlledSwitchRowProps {
    label: string;
    /** 可见副标题；后果无法从标题推断时给 */
    description?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

/**
 * 受控开关行：状态与翻转动作都由调用方给
 * 供「写入不是一次 config.set」的开关用（如悬浮歌词开启要先过权限，落库是 core 成功后的结果）
 */
export function ControlledSwitchRow({
    label,
    description,
    checked,
    onChange,
}: ControlledSwitchRowProps) {
    return (
        <ListItem
            title={<Text>{label}</Text>}
            subtitle={subtitleOf(description)}
            // 尾部走 inline 进入行主体 Pressable：外置 trailing 的右 gutter 与开关上下留白
            // 都落在普通 View 上、点不动，那样整行可点是有死角的
            // 嵌套后点开关由它自己接、点别处由行接——响应者只会有一个，不会双翻转
            trailing={
                <Switch
                    checked={checked}
                    onChange={onChange}
                    // 整行已提供命中区，开关不必再撑 44 壳——否则行会比同档的单选行高一截
                    dense
                    accessibilityLabel={label}
                />
            }
            trailingInline
            dense={description === undefined}
            onPress={() => onChange(!checked)}
            accessibilityLabel={label}
            accessibilityHint={description}
        />
    );
}

interface SwitchRowProps {
    configKey: BooleanConfigKey;
    label: string;
    /** 可见副标题；后果无法从标题推断时给 */
    description?: string;
}

/** 开关行：绑一个布尔 config key，即时写入，无保存 */
export function SwitchRow({ configKey, label, description }: SwitchRowProps) {
    const stored = useConfig(configKey) ?? false;
    return (
        <ControlledSwitchRow
            label={label}
            description={description}
            checked={stored}
            onChange={next => config.set(configKey, next)}
        />
    );
}

interface ChoiceRowProps<K extends ScalarConfigKey> {
    configKey: K;
    label: string;
    /** 可见副标题；后果无法从标题推断时给 */
    description?: string;
    /** 档位表；当前值不在其中时尾部留空（不硬造一个假当前值） */
    options: readonly { value: ConfigSchema[K]; label: string }[];
}

/** 单选行：右侧常驻当前值，整行点开 ActionSheet，选中即用 */
export function ChoiceRow<K extends ScalarConfigKey>({
    configKey,
    label,
    description,
    options,
}: ChoiceRowProps<K>) {
    const t = useT();
    const current = useConfig(configKey);
    const currentLabel = options.find(
        option => option.value === current,
    )?.label;
    return (
        <ListItem
            title={<Text>{label}</Text>}
            subtitle={subtitleOf(description)}
            trailing={
                <Text color="textSecondary" numberOfLines={1}>
                    {currentLabel ?? ''}
                </Text>
            }
            trailingInline
            dense={description === undefined}
            onPress={() =>
                showActionSheetPanel({
                    title: label,
                    items: options.map(option => ({
                        label: option.label,
                        selected: option.value === current,
                        onPress: () => config.set(configKey, option.value),
                    })),
                })
            }
            // 当前值未知时只播报标签，不留一个尾巴空着的「标签：」
            accessibilityLabel={
                currentLabel === undefined
                    ? label
                    : t('settings.a11y.choiceValue', {
                          label,
                          value: currentLabel,
                      })
            }
            accessibilityHint={description}
        />
    );
}

interface ActionRowProps {
    label: string;
    /** 可见副标题；去向或后果无法从标题推断时给 */
    description?: string;
    /** 尾部当前态（如音效的预设名）；无当前态可陈述时不给 */
    value?: string;
    /** 耗时动作进行中；供读屏播报 busy */
    busy?: boolean;
    /** 操作不可用；禁用点击并向读屏播报 */
    disabled?: boolean;
    onPress: () => void;
}

/** 动作行：开面板 / 跳页 / 触发一次性操作 */
export function ActionRow({
    label,
    description,
    value,
    busy = false,
    disabled = false,
    onPress,
}: ActionRowProps) {
    const t = useT();
    return (
        <ListItem
            title={<Text>{label}</Text>}
            subtitle={subtitleOf(description)}
            trailing={
                value === undefined ? undefined : (
                    // 单行截断：预设名来自设备，OEM 可能给很长的名字，换行会把 dense 行撑变形
                    <Text color="textSecondary" numberOfLines={1}>
                        {value}
                    </Text>
                )
            }
            trailingInline
            dense={description === undefined}
            busy={busy}
            disabled={disabled}
            onPress={onPress}
            accessibilityLabel={
                value === undefined
                    ? label
                    : t('settings.a11y.choiceValue', { label, value })
            }
            accessibilityHint={description}
        />
    );
}
