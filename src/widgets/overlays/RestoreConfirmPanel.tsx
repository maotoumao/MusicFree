/**
 * 确认恢复面板（组合内容，非壳）：写入本机前的最后一道复核
 * 只收集决定，不执行——恢复由调用方跑，故面板在开写前就已关闭，不存在「执行中被划走」这个状态
 * 先讲清「这份备份是什么、会带进来什么」，再让用户挑要哪几类、歌单怎么处理
 */
import dayjs from 'dayjs';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { definePanel } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { ListItem } from '@/components/ui/ListItem';
import { PanelCheckRow } from '@/components/ui/PanelCheckRow';
import { Text } from '@/components/ui/Text';
import { space } from '@/design';
import { useT } from '@/i18n';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import type { OverlayProps } from '@/components/overlay';
import type {
    BackupRestoreMode,
    BackupSectionName,
    BackupSections,
    ParsedBackup,
} from '@/core/backup';
import type { PlainKey, PluralKey } from '@/i18n';

/**
 * 段名 → 展示名文案 key
 * 显式映射而非拼接：`musicSheets` 是冻结的 wire 字段名，不该漏到 i18n 命名轴上
 */
const SECTION_LABEL_KEYS: Record<BackupSectionName, PlainKey> = {
    musicSheets: 'restoreConfirmPanel.section.playlists',
    starredPlaylists: 'restoreConfirmPanel.section.starredPlaylists',
    plugins: 'restoreConfirmPanel.section.plugins',
    mediaMeta: 'restoreConfirmPanel.section.mediaMeta',
    settings: 'restoreConfirmPanel.section.settings',
};

export interface RestoreConfirmOptions {
    parsed: ParsedBackup;
}

/** 面板交回的决定：恢复哪几段、歌单怎么处理 */
export interface RestoreDecision {
    selection: BackupSectionName[];
    mode: BackupRestoreMode;
}

/** 一段在面板里的一行：段名 + 一句话说明这段有什么 */
interface SectionRow {
    section: BackupSectionName;
    summary: string;
}

/** 模式只作用于这两段，其余段恒增量；都没选中就别问一个不影响任何东西的问题 */
const MODE_SECTIONS: readonly BackupSectionName[] = [
    'musicSheets',
    'starredPlaylists',
];

/**
 * 备份里真有什么就列什么；缺段恒 no-op，摆出来只会让人以为要动它
 * 一段一行——插件段的插件、订阅、音源重定向合成一句，它们是同进同出的
 */
function summarize(
    sections: BackupSections,
    t: ReturnType<typeof useT>,
): SectionRow[] {
    const rows: SectionRow[] = [];
    const join = (parts: [PluralKey, number][]) =>
        parts
            .filter(([, count]) => count > 0)
            .map(([key, count]) => t(key, { count }))
            .join(t('restoreConfirmPanel.content.sep'));

    if (sections.musicSheets) {
        rows.push({
            section: 'musicSheets',
            summary: t('restoreConfirmPanel.content.playlists', {
                count: sections.musicSheets.length,
            }),
        });
    }
    if (sections.starredPlaylists) {
        rows.push({
            section: 'starredPlaylists',
            summary: t('restoreConfirmPanel.content.starredPlaylists', {
                count: sections.starredPlaylists.length,
            }),
        });
    }
    if (sections.plugins) {
        const { installed, subscriptions, alternatives } = sections.plugins;
        rows.push({
            section: 'plugins',
            summary:
                join([
                    ['restoreConfirmPanel.content.plugins', installed.length],
                    [
                        'restoreConfirmPanel.content.subscriptions',
                        subscriptions.length,
                    ],
                    [
                        'restoreConfirmPanel.content.alternatives',
                        alternatives.length,
                    ],
                ]) || t('restoreConfirmPanel.content.emptySection'),
        });
    }
    if (sections.mediaMeta) {
        rows.push({
            section: 'mediaMeta',
            summary: t('restoreConfirmPanel.content.mediaMeta', {
                count: sections.mediaMeta.length,
            }),
        });
    }
    if (sections.settings) {
        rows.push({
            section: 'settings',
            summary: t('restoreConfirmPanel.content.settings', {
                count: Object.keys(sections.settings.values).length,
            }),
        });
    }
    return rows;
}

function RestoreConfirmPanelView({
    payload,
    close,
}: OverlayProps<RestoreConfirmOptions, RestoreDecision>) {
    const t = useT();
    const { origin, createdAt, formatVariant, sections } = payload.parsed;

    // 不缓存：useT 返回的是稳定的全局 t，按它做 memo 依赖会在切语言后留下旧文案
    const rows = summarize(sections, t);
    const backedUpAt = createdAt === undefined ? undefined : dayjs(createdAt);

    const [mode, setMode] = useState<BackupRestoreMode>('append');
    // 默认全选备份里实际有的内容；用户可以少选，但不能一个不选
    const [selected, setSelected] = useState<BackupSectionName[]>(() =>
        rows.map(row => row.section),
    );
    const [sourcesConfirmed, setSourcesConfirmed] = useState(false);
    const pluginSources = [
        ...new Set([
            ...(sections.plugins?.installed.map(item => item.srcUrl) ?? []),
            ...(sections.plugins?.subscriptions.map(item => item.url) ?? []),
        ]),
    ];
    const requiresSourceConfirmation =
        selected.includes('plugins') && pluginSources.length > 0;

    const toggle = (section: BackupSectionName) => {
        setSelected(current => {
            if (!current.includes(section)) {
                return [...current, section];
            }
            // 取消到零就没什么可恢复的了，最后一项保持选中
            return current.length > 1
                ? current.filter(item => item !== section)
                : current;
        });
    };

    const modeApplies = selected.some(section =>
        MODE_SECTIONS.includes(section),
    );

    const pickMode = () => {
        showActionSheetPanel({
            title: t('restoreConfirmPanel.mode.title'),
            items: (['append', 'overwrite'] as const).map(candidate => ({
                label: t(`restoreConfirmPanel.mode.${candidate}`),
                selected: mode === candidate,
                onPress: () => setMode(candidate),
            })),
        });
    };

    const submit = async () => {
        if (requiresSourceConfirmation && !sourcesConfirmed) {
            return;
        }
        // 覆盖会先清空本机对应内容，不可撤销——落笔前再拦一次
        if (
            modeApplies &&
            mode === 'overwrite' &&
            !(await showConfirmDialog({
                title: t('restoreConfirmPanel.overwriteConfirm.title'),
                message: t('restoreConfirmPanel.overwriteConfirm.message'),
                confirmText: t('restoreConfirmPanel.overwriteConfirm.confirm'),
                danger: true,
            }))
        ) {
            return;
        }
        close({ selection: selected, mode });
    };

    return (
        <ScrollView contentContainerStyle={styles.root}>
            <Text size="xl" weight="bold" lineHeight="tight">
                {t('restoreConfirmPanel.title')}
            </Text>
            <Text size="sm" color="textSecondary" style={styles.source}>
                {origin
                    ? t('restoreConfirmPanel.source.from', {
                          platform: t(
                              `restoreConfirmPanel.platform.${origin.platform}`,
                          ),
                          version: origin.appVersion,
                      })
                    : t('restoreConfirmPanel.source.unknownOrigin')}
                {' · '}
                {backedUpAt?.isValid()
                    ? t('restoreConfirmPanel.source.createdAt', {
                          date: backedUpAt.format('YYYY-MM-DD HH:mm'),
                      })
                    : t('restoreConfirmPanel.source.unknownTime')}
            </Text>
            {formatVariant === 'future' ? (
                <Text size="sm" color="warning">
                    {t('restoreConfirmPanel.source.futureVersion')}
                </Text>
            ) : null}

            {rows.length > 0 ? (
                <View style={styles.list}>
                    {rows.map(row => {
                        const checked = selected.includes(row.section);
                        return (
                            <PanelCheckRow
                                key={row.section}
                                checked={checked}
                                onPress={() => toggle(row.section)}
                                label={row.summary}
                                accessibilityLabel={t(
                                    'restoreConfirmPanel.a11y.sectionRow',
                                    {
                                        section: t(
                                            SECTION_LABEL_KEYS[row.section],
                                        ),
                                        summary: row.summary,
                                    },
                                )}
                                // 最后一项点了不会变，得先告诉读屏用户为什么
                                accessibilityHint={
                                    checked && selected.length === 1
                                        ? t('restoreConfirmPanel.a11y.keepOne')
                                        : undefined
                                }
                            />
                        );
                    })}
                </View>
            ) : (
                <Text color="textSecondary">
                    {t('restoreConfirmPanel.empty')}
                </Text>
            )}

            {requiresSourceConfirmation ? (
                <View style={styles.list}>
                    <Text weight="medium">
                        {t('restoreConfirmPanel.pluginSources.title')}
                    </Text>
                    <Text size="sm" color="warning">
                        {t('restoreConfirmPanel.pluginSources.warning')}
                    </Text>
                    {pluginSources.map(url => (
                        <Text
                            key={url}
                            size="sm"
                            color="textSecondary"
                            selectable
                        >
                            {url}
                        </Text>
                    ))}
                    <PanelCheckRow
                        checked={sourcesConfirmed}
                        onPress={() => setSourcesConfirmed(current => !current)}
                        label={t('restoreConfirmPanel.pluginSources.confirm')}
                        accessibilityLabel={t(
                            'restoreConfirmPanel.pluginSources.confirm',
                        )}
                    />
                </View>
            ) : null}

            {modeApplies ? (
                <View style={styles.modeRow}>
                    <ListItem
                        title={
                            <Text>{t('restoreConfirmPanel.mode.title')}</Text>
                        }
                        subtitle={
                            <Text size="sm" color="textSecondary">
                                {t(`restoreConfirmPanel.mode.${mode}Hint`)}
                            </Text>
                        }
                        trailing={
                            <Text size="sm" color="textSecondary">
                                {t(`restoreConfirmPanel.mode.${mode}`)}
                            </Text>
                        }
                        // 当前值是行的一部分，不是另一个控件：点它就该开菜单
                        trailingInline
                        onPress={pickMode}
                        accessibilityLabel={t(
                            'restoreConfirmPanel.a11y.modeValue',
                            { value: t(`restoreConfirmPanel.mode.${mode}`) },
                        )}
                        accessibilityHint={t(
                            'restoreConfirmPanel.a11y.modeHint',
                        )}
                    />
                </View>
            ) : null}

            <View style={styles.actions}>
                <Button
                    variant="outline"
                    tone="neutral"
                    style={styles.actionBtn}
                    onPress={() => close()}
                >
                    {t('common.cancel')}
                </Button>
                <Button
                    variant="filled"
                    tone="primary"
                    style={styles.actionBtn}
                    disabled={
                        rows.length === 0 ||
                        (requiresSourceConfirmation && !sourcesConfirmed)
                    }
                    onPress={() => {
                        submit().catch(() => {});
                    }}
                >
                    {t('restoreConfirmPanel.start')}
                </Button>
            </View>
        </ScrollView>
    );
}

/** 确认恢复面板：`await showRestoreConfirmPanel({ parsed })` → 选中的段与恢复模式，取消 / 返回键 / backdrop 为 undefined */
export const showRestoreConfirmPanel = definePanel(RestoreConfirmPanelView);

const styles = StyleSheet.create({
    root: {
        paddingHorizontal: space.lg,
        gap: space.md,
    },
    source: {
        marginTop: -space.xs,
    },
    list: {
        gap: space.xs,
    },
    modeRow: {
        // ListItem 自带行内边距，抵消 root 的横向留白让它整行贯通，看着就是可点的一条
        marginHorizontal: -space.lg,
    },
    actions: {
        flexDirection: 'row',
        gap: space.md,
    },
    actionBtn: {
        flex: 1,
    },
});
