import { useAtomValue } from 'jotai';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Switch } from '@/components/ui/Switch';
import { Text } from '@/components/ui/Text';
import { theme, THEME_OPAQUE_COLOR_ROLES } from '@/core/theme';
import {
    borderWidth,
    layout,
    radius,
    resolveThemeColors,
    space,
    substrateTextContrastAtom,
    useColors,
} from '@/design';
import { useT } from '@/i18n';
import { colord } from '@/utils/color';
import { showColorPickerPanel } from '@/widgets/overlays/ColorPickerPanel';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import { COLOR_ROLE_GROUPS } from '../lib/colorRoleGroups';

import type { ThemeColorRole, ThemePack } from '@/core/theme';

interface ColorControlsProps {
    pack: ThemePack;
}

/** 正文与基底对比度低于此值就在体检行提示；只提示，不拦截提交 */
const LOW_CONTRAST = 4.5;

/**
 * 配色控制区：主要角色常驻，状态色与派生角色收进「高级」
 *
 * 改色即时写入并全局生效——编辑器自身就是样张。派生角色未被写入时显示「自动」，
 * 写入即视为解锁手动，点「自动」按钮可退回派生。
 */
function ColorControls({ pack }: ColorControlsProps) {
    const t = useT();
    const [advanced, setAdvanced] = useState(false);
    // 展示的是这套主题解析后的实际取值（含派生结果），不是原始覆盖表
    const resolved = resolveThemeColors(pack.scheme, pack.colors, null);

    const setColor = (role: ThemeColorRole, color: string | null) => {
        theme.setPackColor(pack.id, role, color);
    };

    const openPicker = (role: ThemeColorRole) => {
        // 除页面底色外都开 alpha 条；词表直接取自 core，免得两处漂移
        showColorPickerPanel({
            title: t(`themeEditor.color.role.${role}`),
            value: colord(resolved[role]).toHex(),
            showOpacity: !THEME_OPAQUE_COLOR_ROLES.has(role),
            onChange: hex => setColor(role, hex),
        });
    };

    const reset = () => {
        showConfirmDialog({
            title: t('themeEditor.color.resetTitle'),
            message: t('themeEditor.color.resetConfirm'),
        }).then(confirmed => {
            if (confirmed) {
                theme.resetPackColors(pack.id);
            }
        });
    };

    return (
        <View style={styles.root}>
            <ContrastHint />
            {COLOR_ROLE_GROUPS.map(group =>
                group.key === 'main' || advanced ? (
                    <View key={group.key} style={styles.group}>
                        {group.key === 'main' ? null : (
                            <Text size="sm" color="textSecondary">
                                {t(`themeEditor.color.${group.key}`)}
                            </Text>
                        )}
                        {group.roles.map(role => (
                            <ColorRow
                                key={role}
                                label={t(`themeEditor.color.role.${role}`)}
                                color={resolved[role]}
                                overridden={pack.colors[role] !== undefined}
                                onPress={() => openPicker(role)}
                                onClear={() => setColor(role, null)}
                            />
                        ))}
                    </View>
                ) : null,
            )}

            <Pressable
                onPress={() => setAdvanced(current => !current)}
                accessibilityRole="button"
                accessibilityState={{ expanded: advanced }}
                accessibilityLabel={t('themeEditor.color.advanced')}
                style={styles.advanced}
            >
                <Text size="sm" weight="medium" color="primary">
                    {t('themeEditor.color.advanced')}
                </Text>
                <Icon
                    name={advanced ? 'chevron-up' : 'chevron-down'}
                    size="sm"
                    color="primary"
                />
            </Pressable>

            <View style={styles.switchRow}>
                <View style={styles.switchText}>
                    <Text>{t('themeEditor.autoContrast')}</Text>
                    <Text size="sm" color="textSecondary">
                        {t('themeEditor.autoContrastHint')}
                    </Text>
                </View>
                <Switch
                    checked={pack.autoContrast}
                    onChange={enabled =>
                        theme.setPackAutoContrast(pack.id, enabled)
                    }
                    accessibilityLabel={t('themeEditor.autoContrast')}
                />
            </View>

            <Button variant="outline" tone="neutral" onPress={reset}>
                {t('themeEditor.color.reset')}
            </Button>
        </View>
    );
}

/** 正文对比度体检：只报数与「偏低」，不阻止任何配置 */
function ContrastHint() {
    const t = useT();
    const contrast = useAtomValue(substrateTextContrastAtom);
    const low = contrast < LOW_CONTRAST;
    return (
        <View style={styles.contrast}>
            <Text size="sm" color="textSecondary">
                {t('themeEditor.contrast.title')}
            </Text>
            <Text size="sm" weight="medium" color={low ? 'warning' : 'success'}>
                {t('themeEditor.contrast.value', {
                    ratio: contrast.toFixed(1),
                })}
                {low ? ` · ${t('themeEditor.contrast.low')}` : ''}
            </Text>
        </View>
    );
}

/** 单个角色行：色块 + 覆盖态的「自动」回退键 */
function ColorRow({
    label,
    color,
    overridden,
    onPress,
    onClear,
}: {
    label: string;
    color: string;
    overridden: boolean;
    onPress: () => void;
    onClear: () => void;
}) {
    const t = useT();
    const colors = useColors();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={t('themeEditor.a11y.editColorRole', {
                role: label,
                color: colord(color).toHex().toUpperCase(),
            })}
            style={styles.row}
        >
            <Text style={styles.rowLabel} numberOfLines={1}>
                {label}
            </Text>
            {overridden ? (
                <Pressable
                    onPress={onClear}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} ${t(
                        'themeEditor.color.auto',
                    )}`}
                    hitSlop={space.sm}
                >
                    <Text size="sm" color="primary">
                        {t('themeEditor.color.auto')}
                    </Text>
                </Pressable>
            ) : null}
            <View
                style={[
                    styles.swatch,
                    {
                        backgroundColor: color,
                        borderColor: colors.border,
                    },
                ]}
            />
        </Pressable>
    );
}

const SWATCH = 24;

const styles = StyleSheet.create({
    root: {
        paddingHorizontal: layout.screenGutter,
        paddingVertical: space.md,
        gap: space.md,
    },
    group: { gap: space.xs },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        minHeight: layout.hitTarget,
    },
    rowLabel: { flex: 1 },
    swatch: {
        width: SWATCH,
        height: SWATCH,
        borderRadius: radius.full,
        borderWidth: borderWidth.hairline,
    },
    advanced: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xs,
        minHeight: layout.hitTarget,
    },
    contrast: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.sm,
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        minHeight: layout.hitTarget,
    },
    switchText: { flex: 1, gap: 2 },
});

export { ColorControls };
