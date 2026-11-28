import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { showToast } from '@/components/overlay';
import { appUpdate, type AppRelease } from '@/core/appUpdate';
import { useT } from '@/i18n';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showAppUpdateDialog } from '@/widgets/overlays/AppUpdateDialog';

/** About 页手动检查：提供 loading 与结果反馈，并编排更新弹窗的下载动作 */
export function useCheckUpdate(): {
    checking: boolean;
    checkUpdate: () => void;
} {
    const t = useT();
    const [checking, setChecking] = useState(false);
    const inFlight = useRef(false);
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    const checkUpdate = useCallback(() => {
        if (inFlight.current) {
            return;
        }
        inFlight.current = true;
        setChecking(true);

        const showRelease = async (release: AppRelease) => {
            const openDownload = (url: string) => {
                appUpdate.setVersionSkipped(release.version, false);
                Linking.openURL(url).catch(() => {
                    showToast(t('feedback.openLinkFailed'), { type: 'error' });
                });
            };
            const action = await showAppUpdateDialog({
                release,
                initialSkipVersion: appUpdate.isVersionSkipped(release.version),
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
        };

        appUpdate
            .check()
            .then(result => {
                if (!alive.current) {
                    return undefined;
                }
                if (result.kind === 'available') {
                    return showRelease(result.release);
                }
                showToast(
                    result.kind === 'upToDate'
                        ? t('about.update.upToDate')
                        : t('about.update.checkFailed'),
                    { type: result.kind === 'upToDate' ? 'success' : 'error' },
                );
                return undefined;
            })
            .catch(() => {
                if (alive.current) {
                    showToast(t('about.update.checkFailed'), { type: 'error' });
                }
            })
            .finally(() => {
                inFlight.current = false;
                if (alive.current) {
                    setChecking(false);
                }
            });
    }, [t]);

    return { checking, checkUpdate };
}
