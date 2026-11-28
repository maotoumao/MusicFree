/**
 * 导出备份面板（组合内容，非壳）：先给两个目的地，再给一条可折叠的内容选择
 * 内容选择收进子面板：绝大多数人就是「全都要」，五个勾选框摆在首屏会跟主动作抢注意力
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { definePanel } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { PanelCheckRow } from '@/components/ui/PanelCheckRow';
import { PanelRow } from '@/components/ui/PanelRow';
import { Text } from '@/components/ui/Text';
import { space } from '@/design';
import { useT } from '@/i18n';

import type { OverlayProps } from '@/components/overlay';
import type { BackupSectionName } from '@/core/backup';
import type { PlainKey } from '@/i18n';

/** 导出的去处 */
export type BackupDestination = 'downloads' | 'webdav';

/** 面板交回的决定：导出到哪、导出哪几类 */
export interface BackupExportDecision {
    destination: BackupDestination;
    selection: BackupSectionName[];
}

/**
 * 可导出的内容；顺序即展示顺序
 * 段名与文案 key 显式配对：`musicSheets` 是冻结的 wire 字段名，不该漏到 i18n 命名轴上
 */
const SECTIONS: readonly {
    section: BackupSectionName;
    labelKey: PlainKey;
    descriptionKey?: PlainKey;
}[] = [
    {
        section: 'musicSheets',
        labelKey: 'backupContentPanel.section.playlists',
        descriptionKey: 'backupContentPanel.section.playlistsHint',
    },
    {
        section: 'starredPlaylists',
        labelKey: 'backupContentPanel.section.starredPlaylists',
    },
    { section: 'plugins', labelKey: 'backupContentPanel.section.plugins' },
    { section: 'mediaMeta', labelKey: 'backupContentPanel.section.mediaMeta' },
    { section: 'settings', labelKey: 'backupContentPanel.section.settings' },
];

function BackupContentPanelView({
    payload,
    close,
}: OverlayProps<{ selection: BackupSectionName[] }, BackupSectionName[]>) {
    const t = useT();
    const [selected, setSelected] = useState(payload.selection);

    const toggle = (section: BackupSectionName) => {
        setSelected(current => {
            if (!current.includes(section)) {
                return [...current, section];
            }
            // 一类都不选就没什么可导出的了，最后一项保持选中
            return current.length > 1
                ? current.filter(item => item !== section)
                : current;
        });
    };

    return (
        <ScrollView contentContainerStyle={styles.root}>
            <Text size="xl" weight="bold" lineHeight="tight">
                {t('backupContentPanel.title')}
            </Text>
            <Text size="sm" color="textSecondary" style={styles.note}>
                {t('backupContentPanel.note')}
            </Text>
            <View style={styles.list}>
                {SECTIONS.map(({ section, labelKey, descriptionKey }) => {
                    const checked = selected.includes(section);
                    const label = t(labelKey);
                    const description = descriptionKey
                        ? t(descriptionKey)
                        : undefined;
                    return (
                        <PanelCheckRow
                            key={section}
                            checked={checked}
                            onPress={() => toggle(section)}
                            label={label}
                            description={description}
                            // 显式 label 会盖掉子文本派生，说明得自己拼进来，否则读屏听不到
                            accessibilityLabel={
                                description
                                    ? t('backupContentPanel.a11y.sectionRow', {
                                          section: label,
                                          hint: description,
                                      })
                                    : label
                            }
                            accessibilityHint={
                                checked && selected.length === 1
                                    ? t('backupContentPanel.a11y.keepOne')
                                    : undefined
                            }
                        />
                    );
                })}
            </View>
            <Button onPress={() => close(selected)}>{t('common.done')}</Button>
        </ScrollView>
    );
}

const showBackupContentPanel = definePanel(BackupContentPanelView);

function BackupExportPanelView({
    close,
}: OverlayProps<void, BackupExportDecision>) {
    const t = useT();
    const [selection, setSelection] = useState<BackupSectionName[]>(() =>
        SECTIONS.map(item => item.section),
    );
    const all = selection.length === SECTIONS.length;

    const pickContent = async () => {
        const picked = await showBackupContentPanel({ selection });
        if (picked) {
            setSelection(picked);
        }
    };

    return (
        <View style={styles.exportRoot}>
            <Text
                size="xl"
                weight="bold"
                lineHeight="tight"
                style={styles.exportTitle}
            >
                {t('backupExportPanel.title')}
            </Text>
            <PanelRow
                label={t('backupExportPanel.toDownloads')}
                onPress={() => close({ destination: 'downloads', selection })}
            />
            <PanelRow
                label={t('backupExportPanel.toWebdav')}
                onPress={() => close({ destination: 'webdav', selection })}
            />
            <PanelRow
                label={t('backupExportPanel.content')}
                value={
                    all
                        ? t('backupExportPanel.contentAll')
                        : t('backupExportPanel.contentSome', {
                              count: selection.length,
                          })
                }
                separatorBefore
                onPress={() => {
                    pickContent().catch(() => {});
                }}
            />
        </View>
    );
}

/** 导出备份面板：`await showBackupExportPanel()` → 去处与内容选择，取消 / 返回键 / backdrop 为 undefined */
export const showBackupExportPanel = definePanel(BackupExportPanelView);

const styles = StyleSheet.create({
    root: {
        paddingHorizontal: space.lg,
        gap: space.md,
    },
    note: {
        marginTop: -space.xs,
    },
    list: {
        gap: space.xs,
    },
    exportRoot: {
        flexGrow: 1,
        flexShrink: 1,
    },
    exportTitle: {
        paddingHorizontal: space.lg,
        marginBottom: space.md,
    },
});
