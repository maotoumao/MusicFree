import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useAtomValue } from 'jotai';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { showToast } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { ListItem } from '@/components/ui/ListItem';
import { Section } from '@/components/ui/Section';
import { Spinner } from '@/components/ui/Spinner';
import { Text } from '@/components/ui/Text';
import { useConfig } from '@/core/config';
import { layout, space } from '@/design';
import { useBackAction } from '@/hooks/useBackAction';
import { useContentColumn } from '@/hooks/useContentColumn';
import { useT, type PlainKey } from '@/i18n';
import { httpHostOf } from '@/utils/url';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showBackupExportPanel } from '@/widgets/overlays/BackupExportPanel';
import { showRestoreConfirmPanel } from '@/widgets/overlays/RestoreConfirmPanel';
import { showWebdavConnectionPanel } from '@/widgets/overlays/WebdavConnectionPanel';

import { useExportBackup } from './hooks/useExportBackup';
import {
    useParseBackupSource,
    type RestoreSource,
} from './hooks/useParseBackupSource';
import { useRestoreBackup } from './hooks/useRestoreBackup';
import {
    backupCancellableAtom,
    backupOpAtom,
    cancelBackupOp,
    type BackupOp,
} from './store';

/** 进行中横幅的文案：每项耗时操作各说各的，不用一句笼统的「请稍候」 */
const BUSY_LABEL_KEYS: Record<BackupOp, PlainKey> = {
    exporting: 'backupRestore.export.exporting',
    reading: 'backupRestore.restore.reading',
    restoring: 'backupRestore.restore.restoring',
};

/** 恢复来源清单：顺序即入口排列顺序 */
const RESTORE_SOURCES: readonly {
    source: RestoreSource;
    labelKey:
        | 'backupRestore.restore.fromFile'
        | 'backupRestore.restore.fromWebdav'
        | 'backupRestore.restore.fromUrl';
}[] = [
    { source: 'file', labelKey: 'backupRestore.restore.fromFile' },
    { source: 'webdav', labelKey: 'backupRestore.restore.fromWebdav' },
    { source: 'url', labelKey: 'backupRestore.restore.fromUrl' },
];

/**
 * 备份与恢复页：低频、涉及数据安全的工具页
 * 先让用户表达「要干什么」，再问「走哪条路」，不把传输渠道摊成平行入口
 */
export default function BackupRestoreScreen() {
    const t = useT();
    const back = useBackAction();
    const exportTo = useExportBackup();
    const parseFrom = useParseBackupSource();
    const restore = useRestoreBackup();
    const navigation = useNavigation();
    const op = useAtomValue(backupOpAtom);
    const cancellable = useAtomValue(backupCancellableAtom);
    // 只拿主机名：地址可能内嵌凭据或查询令牌，不能原样常驻在列表里
    const webdavHost = httpHostOf(useConfig('webdav.url') ?? '');

    // 正在写入时不放人走：结果页由本页 push，人走了结果就无处可报
    usePreventRemove(op === 'restoring', () => {
        showToast(t('backupRestore.opInProgress'), { type: 'info' });
    });

    /** 面板收集去处与内容；选 WebDAV 但没连过服务器就先配置，配好接着导出 */
    const startExport = async () => {
        const decision = await showBackupExportPanel();
        if (!decision) {
            return;
        }
        if (
            decision.destination === 'webdav' &&
            webdavHost === undefined &&
            !(await showWebdavConnectionPanel())
        ) {
            return;
        }
        exportTo(decision);
    };

    /** 读出来先不写入，交面板复核；用户取消或读不成则原地不动 */
    const restoreFrom = async (source: RestoreSource) => {
        if (source === 'webdav' && webdavHost === undefined) {
            if (!(await showWebdavConnectionPanel())) {
                return;
            }
        }
        const parsed = await parseFrom(source);
        if (!parsed) {
            return;
        }
        // 读取期间用户可能已经走了，别把面板弹到别人的页面上；
        // 但也不能一声不吭地把读到的结果丢掉——那正是「点了没反应」的样子
        if (!navigation.isFocused()) {
            showToast(t('backupRestore.restore.leftPage'), { type: 'info' });
            return;
        }
        // 面板只收集决定；开写前它已关闭，执行与结果都归本页
        const decision = await showRestoreConfirmPanel({ parsed });
        if (decision) {
            await restore(parsed, decision);
        }
    };

    const pickSource = () => {
        showActionSheetPanel({
            title: t('backupRestore.restore.source'),
            items: RESTORE_SOURCES.map(({ source, labelKey }) => ({
                label: t(labelKey),
                onPress: () => {
                    restoreFrom(source).catch(() => {});
                },
            })),
        });
    };

    // 同一时刻只会有一项在跑，用一条横幅说明当前在干什么
    // 平板：表单列限阅读宽（手机 undefined，contentContainerStyle 原样）
    const column = useContentColumn('reading');
    const busyLabel = op === null ? undefined : t(BUSY_LABEL_KEYS[op]);

    return (
        <Screen edges={['bottom']}>
            <AppBar
                title={t('backupRestore.title')}
                leading={back}
                contentWidth="reading"
            />
            {busyLabel ? (
                <View style={styles.busyBanner}>
                    <View
                        accessible
                        accessibilityRole="progressbar"
                        accessibilityLiveRegion="polite"
                        accessibilityLabel={busyLabel}
                        style={styles.busyText}
                    >
                        <Spinner size="sm" color="textSecondary" />
                        <Text size="sm" color="textSecondary">
                            {busyLabel}
                        </Text>
                    </View>
                    {/*
                     * 网络往返可能要几十分钟（预算按备份大小折算），没有出口的话
                     * 「等着」和「卡死了」在用户那儿是同一回事；恢复不给取消——它在往本机写
                     */}
                    {cancellable ? (
                        <Button
                            variant="ghost"
                            tone="neutral"
                            size="sm"
                            onPress={cancelBackupOp}
                        >
                            {t('common.cancel')}
                        </Button>
                    ) : null}
                </View>
            ) : null}
            <PaperPane width="reading">
                <ScrollView
                    contentContainerStyle={
                        column ? [styles.content, column] : styles.content
                    }
                >
                    <Section title={t('backupRestore.export.title')}>
                        <ListItem
                            title={
                                <Text>{t('backupRestore.export.backup')}</Text>
                            }
                            subtitle={
                                <Text size="sm" color="textSecondary">
                                    {t('backupRestore.export.destinations')}
                                </Text>
                            }
                            onPress={() => {
                                startExport().catch(() => {});
                            }}
                            busy={op === 'exporting'}
                            accessibilityLabel={t(
                                'backupRestore.export.backup',
                            )}
                            accessibilityHint={t(
                                'backupRestore.a11y.exportHint',
                            )}
                        />
                    </Section>
                    <Section title={t('backupRestore.restore.title')}>
                        <ListItem
                            title={
                                <Text>{t('backupRestore.restore.backup')}</Text>
                            }
                            subtitle={
                                <Text size="sm" color="textSecondary">
                                    {t('backupRestore.restore.sources')}
                                </Text>
                            }
                            onPress={pickSource}
                            busy={op === 'reading' || op === 'restoring'}
                            accessibilityLabel={t(
                                'backupRestore.restore.backup',
                            )}
                            accessibilityHint={t(
                                'backupRestore.a11y.restoreHint',
                            )}
                        />
                    </Section>
                    <Section title={t('backupRestore.webdav.title')}>
                        <ListItem
                            title={
                                <Text>
                                    {t('backupRestore.webdav.connection')}
                                </Text>
                            }
                            subtitle={
                                <Text size="sm" color="textSecondary">
                                    {webdavHost ??
                                        t('backupRestore.webdav.notConfigured')}
                                </Text>
                            }
                            onPress={() => {
                                showWebdavConnectionPanel().catch(() => {});
                            }}
                            accessibilityLabel={t(
                                'backupRestore.webdav.connection',
                            )}
                        />
                    </Section>
                </ScrollView>
            </PaperPane>
        </Screen>
    );
}

const styles = StyleSheet.create({
    // 忙碌提示：横贯页顶，比改副标题显眼；不做伪进度（导出无进度可报）
    busyBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
    },
    // 文案与转圈合成一个无障碍节点，取消键留在它外面自成一个可点目标
    busyText: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        flexShrink: 1,
    },
    content: {
        paddingBottom: space.xl,
        // 手机横屏沿用旧的 640 限宽居中；平板由 useContentColumn 覆盖为 reading 列
        width: '100%',
        maxWidth: layout.listContentMaxWidth,
        alignSelf: 'center',
    },
});
