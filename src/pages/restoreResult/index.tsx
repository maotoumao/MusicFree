import {
    useNavigation,
    useRoute,
    type RouteProp,
} from '@react-navigation/native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { ListItem } from '@/components/ui/ListItem';
import { Text } from '@/components/ui/Text';
import { classifyRestoreResult } from '@/core/backup';
import { layout, space } from '@/design';
import { useBackAction } from '@/hooks/useBackAction';
import { useContentColumn } from '@/hooks/useContentColumn';
import { useT } from '@/i18n';

import type { RestoreBackupResult, RestoreSectionOutcome } from '@/core/backup';
import type { PlainKey, PluralKey } from '@/i18n';

/** 恢复结果页路由参数：逐段结局是纯数据，直接随路由带走即可 */
export type RestoreResultParams = { result: RestoreBackupResult };

/**
 * 端口错误码 → 说人话的原因
 * 端口的 message 常常就是错误码本身，直接展示等于把 PERSISTENCE_FAILED 甩给用户，故一律不展示原始 message
 */
const FAILURE_COPY: Record<string, PlainKey> = {
    STORAGE_DEGRADED: 'restoreResult.failure.storageDegraded',
    PERSISTENCE_FAILED: 'restoreResult.failure.persistenceFailed',
};

interface ResultRow {
    labelKey: PlainKey;
    statusKey: PlainKey;
    detail: string;
}

/**
 * 把一段的结局翻成一行「做了什么」
 * ok 报计数，skipped 说明为什么没动，failed 给可读原因
 */
function toRow<TCounts>(
    labelKey: PlainKey,
    outcome: RestoreSectionOutcome<TCounts>,
    t: ReturnType<typeof useT>,
    describe: (counts: TCounts) => string,
): ResultRow {
    if (outcome.status === 'ok') {
        return {
            labelKey,
            statusKey: 'restoreResult.status.restored',
            detail: describe(outcome.counts),
        };
    }
    if (outcome.status === 'skipped') {
        return {
            labelKey,
            statusKey: 'restoreResult.status.skipped',
            detail:
                outcome.reason === 'absent'
                    ? t('restoreResult.skipped.absent')
                    : t('restoreResult.skipped.notSelected'),
        };
    }
    const copy =
        outcome.errorCode === undefined
            ? undefined
            : FAILURE_COPY[outcome.errorCode];
    return {
        labelKey,
        statusKey: 'restoreResult.status.failed',
        detail: t(copy ?? 'restoreResult.failure.unknown'),
    };
}

/** 恢复结果页：恢复不顺利时唯一的完整记录，逐段如实交代 */
export default function RestoreResultScreen() {
    const route =
        useRoute<
            RouteProp<{ RestoreResult: RestoreResultParams }, 'RestoreResult'>
        >();
    const { result } = route.params;
    const t = useT();
    const back = useBackAction();
    const navigation = useNavigation();

    /**
     * 计数拼成一句
     * 先按数值筛掉为零的再翻译——翻译完的「安装 0 个」是非空字符串，那时候再过滤已经滤不掉了
     */
    const counts = (parts: [PluralKey, number][]) =>
        parts
            .filter(([, count]) => count > 0)
            .map(([key, count]) => t(key, { count }))
            .join(t('restoreResult.counts.sep'));

    const rows: ResultRow[] = [
        toRow(
            'restoreResult.section.playlists',
            result.musicSheets,
            t,
            c =>
                counts([
                    [
                        'restoreResult.counts.playlistsCreated',
                        c.localPlaylistsCreated,
                    ],
                    ['restoreResult.counts.musicAdded', c.musicAdded],
                    // 去重与非法是两回事：前者是预期内的，后者是真丢了内容
                    [
                        'restoreResult.counts.musicDuplicates',
                        c.musicDuplicatesSkipped,
                    ],
                    [
                        'restoreResult.counts.musicInvalid',
                        c.invalidMusicSkipped,
                    ],
                ]) || t('restoreResult.counts.nothing'),
        ),
        toRow(
            'restoreResult.section.starredPlaylists',
            result.starredPlaylists,
            t,
            c =>
                counts([
                    ['restoreResult.counts.starredAdded', c.starredAdded],
                    ['restoreResult.counts.starredSkipped', c.starredSkipped],
                ]) || t('restoreResult.counts.nothing'),
        ),
        toRow(
            'restoreResult.section.plugins',
            result.plugins,
            t,
            c =>
                counts([
                    [
                        'restoreResult.counts.pluginsInstalled',
                        c.pluginsInstalled,
                    ],
                    ['restoreResult.counts.pluginsSkipped', c.pluginsSkipped],
                    [
                        'restoreResult.counts.pluginsFailed',
                        c.pluginInstallFailures.length,
                    ],
                    [
                        'restoreResult.counts.subscriptionsAdded',
                        c.subscriptionsAdded,
                    ],
                    [
                        'restoreResult.counts.subscriptionsSkipped',
                        c.subscriptionsSkipped,
                    ],
                    [
                        'restoreResult.counts.alternativesAdded',
                        c.alternativesAdded,
                    ],
                    [
                        'restoreResult.counts.alternativesSkipped',
                        c.alternativesSkipped,
                    ],
                ]) || t('restoreResult.counts.nothing'),
        ),
        toRow(
            'restoreResult.section.mediaMeta',
            result.mediaMeta,
            t,
            c =>
                counts([
                    ['restoreResult.counts.metaUpserted', c.upserted],
                    ['restoreResult.counts.metaSkipped', c.skipped],
                ]) || t('restoreResult.counts.nothing'),
        ),
        toRow(
            'restoreResult.section.settings',
            result.settings,
            t,
            c =>
                counts([
                    ['restoreResult.counts.settingsApplied', c.applied],
                    ['restoreResult.counts.settingsSkipped', c.skipped],
                ]) || t('restoreResult.counts.nothing'),
        ),
    ];

    // 与分流共用同一判定：不能这边说「进结果页」、那边标题写「恢复完成」
    // 平板：内容与底部按钮同一阅读列（手机 undefined，样式原样）
    const column = useContentColumn('reading');
    const outcome = classifyRestoreResult(result);

    return (
        <Screen edges={['bottom']}>
            <AppBar
                title={t('restoreResult.title')}
                leading={back}
                contentWidth="reading"
            />
            <PaperPane width="reading">
                <ScrollView
                    contentContainerStyle={
                        column ? [styles.content, column] : styles.content
                    }
                >
                    <Text size="lg" weight="bold" style={styles.heading}>
                        {t(`restoreResult.outcome.${outcome}`)}
                    </Text>
                    {rows.map(row => (
                        // 三段文字包成一个无障碍单元，读屏才会连着念「段名，状态，计数」
                        <View
                            key={row.labelKey}
                            accessible
                            accessibilityLabel={t('restoreResult.a11y.row', {
                                section: t(row.labelKey),
                                status: t(row.statusKey),
                                detail: row.detail,
                            })}
                        >
                            <ListItem
                                title={<Text>{t(row.labelKey)}</Text>}
                                subtitle={
                                    <Text size="sm" color="textSecondary">
                                        {row.detail}
                                    </Text>
                                }
                                trailing={
                                    <Text size="sm" color="textSecondary">
                                        {t(row.statusKey)}
                                    </Text>
                                }
                            />
                        </View>
                    ))}
                    {result.localMediaIgnored > 0 ? (
                        // 跨设备恢复的正常结果，不是失败，所以不用 danger 色
                        <Text
                            size="sm"
                            color="textSecondary"
                            style={styles.localNote}
                        >
                            {t('restoreResult.localMediaIgnored', {
                                count: result.localMediaIgnored,
                            })}
                        </Text>
                    ) : null}
                </ScrollView>
            </PaperPane>
            <View style={column ? [styles.footer, column] : styles.footer}>
                <Button onPress={() => navigation.goBack()}>
                    {t('common.done')}
                </Button>
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingBottom: space.xl,
        // 手机横屏沿用旧的 640 限宽居中；平板由 useContentColumn 覆盖为 reading 列
        width: '100%',
        maxWidth: layout.listContentMaxWidth,
        alignSelf: 'center',
    },
    heading: {
        paddingHorizontal: space.lg,
        paddingTop: space.md,
        paddingBottom: space.sm,
    },
    localNote: {
        paddingHorizontal: space.lg,
        paddingTop: space.lg,
    },
    footer: {
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        width: '100%',
        maxWidth: layout.listContentMaxWidth,
        alignSelf: 'center',
    },
});
