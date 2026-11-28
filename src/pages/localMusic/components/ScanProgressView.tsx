import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { localMusic, useScanProgress } from '@/core/localMusic';
import { space } from '@/design';
import { useT } from '@/i18n';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import { ScanProgressBar } from './ScanProgressBar';

import type { OverlayHandle } from '@/components/overlay';

/**
 * 扫描全屏进度（首次与重扫统一）：标题 + 已找到 N 首 + 确定性进度条 + 当前位置
 * 枚举阶段总数未知，进度条走空轨道（不伪造百分比），底部提示获取文件列表；随时可取消（二次确认，保留已合并结果）
 */
export function ScanProgressView() {
    const t = useT();
    const progress = useScanProgress();
    const enumerating = progress.status === 'enumerating';
    const cancelHandleRef = useRef<OverlayHandle<boolean> | null>(null);

    // 取消 / 硬件返回：二次确认「取消扫描？已扫到的结果会保留」→ cancelScan；防重复开、卸载关残留框
    const confirmCancel = useCallback(() => {
        if (cancelHandleRef.current) {
            return;
        }
        const handle = showConfirmDialog({
            title: t('localMusic.scan.cancelConfirm.title'),
            message: t('localMusic.scan.cancelConfirm.message'),
            confirmText: t('localMusic.scan.cancel'),
            danger: true,
        });
        cancelHandleRef.current = handle;
        handle
            .then(ok => {
                if (ok) {
                    localMusic.cancelScan();
                }
            })
            .catch(() => {})
            .finally(() => {
                cancelHandleRef.current = null;
            });
    }, [t]);
    useFocusEffect(
        useCallback(() => {
            const sub = BackHandler.addEventListener(
                'hardwareBackPress',
                () => {
                    confirmCancel();
                    return true;
                },
            );
            return () => sub.remove();
        }, [confirmCancel]),
    );
    // 扫描结算 → 本组件卸载：关掉可能仍开着的确认框，避免残留到完成后的列表 / 控制台
    useEffect(
        () => () => {
            cancelHandleRef.current?.close(false);
            cancelHandleRef.current = null;
        },
        [],
    );

    return (
        <View style={styles.container}>
            <Text size="lg" weight="bold">
                {t('localMusic.scan.scanningTitle')}
            </Text>
            <Text size="sm" color="textSecondary">
                {t('localMusic.scan.found', { count: progress.found })}
            </Text>
            <ScanProgressBar
                processed={progress.processed}
                total={progress.total}
            />
            {enumerating || progress.currentPath ? (
                <Text
                    size="xs"
                    color="textSecondary"
                    numberOfLines={1}
                    style={styles.path}
                >
                    {enumerating
                        ? t('localMusic.scan.enumerating')
                        : progress.currentPath}
                </Text>
            ) : null}
            <Button variant="ghost" tone="neutral" onPress={confirmCancel}>
                {t('localMusic.scan.cancel')}
            </Button>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.xl,
        gap: space.sm,
    },
    path: {
        alignSelf: 'stretch',
        textAlign: 'center',
    },
});
