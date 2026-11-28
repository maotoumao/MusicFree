import { useEffect } from 'react';
import { Linking } from 'react-native';

import { showToast } from '@/components/overlay';
import { appUpdate, type AppRelease } from '@/core/appUpdate';
import { t } from '@/i18n';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showAppUpdateDialog } from '@/widgets/overlays/AppUpdateDialog';

async function showAvailableUpdate(release: AppRelease): Promise<void> {
    const openDownload = (url: string) => {
        appUpdate.setVersionSkipped(release.version, false);
        Linking.openURL(url).catch(() => {
            showToast(t('feedback.openLinkFailed'), { type: 'error' });
        });
    };
    const action = await showAppUpdateDialog({
        release,
        onSkipVersionChange: skipped => {
            appUpdate.setVersionSkipped(release.version, skipped);
        },
    });
    if (action === 'otherDownloads') {
        showActionSheetPanel({
            title: t('appUpdateDialog.otherDownloads'),
            items: release.downloadUrls.slice(1).map((url, index) => ({
                label: t('appUpdateDialog.downloadAddress', {
                    number: index + 2,
                }),
                onPress: () => openDownload(url),
            })),
        });
        return;
    }
    if (action === 'download') {
        const [target] = release.downloadUrls;
        if (target !== undefined) {
            openDownload(target);
        }
    }
}

/** 非关键的一次性初始化统一入口；内部任务不向组合根暴露 */
export function DeferredInit() {
    useEffect(() => {
        appUpdate
            .checkIfDue()
            .then(result => {
                if (
                    result?.kind !== 'available' ||
                    appUpdate.isVersionSkipped(result.release.version)
                ) {
                    return undefined;
                }
                return showAvailableUpdate(result.release);
            })
            .catch(() => {
                // 自动检查与展示失败静默；不影响用户继续使用 App
            });
    }, []);

    return null;
}
