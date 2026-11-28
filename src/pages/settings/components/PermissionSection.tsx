import { Platform } from 'react-native';

import { showToast } from '@/components/overlay';
import { Section } from '@/components/ui/Section';
import { useT } from '@/i18n';
import {
    checkStorageReadAccess,
    openStorageSettings,
    requestStorageReadAccess,
} from '@/infra/permission';
import systemGates from '@/infra/systemGates';

import { useSystemGateGranted } from '../hooks/useSystemGateGranted';

import { ActionRow } from './SettingRows';

import type { ReactElement } from 'react';

/**
 * 权限分区：三道系统门的当前状态 + 直达系统设置页
 * 全是 Android 概念（iOS 无对应物），整块不在 iOS 渲染
 */
export function PermissionSection(): ReactElement | null {
    // 平台判断放在没有 hook 的外壳里：iOS 连查询都不该发起
    if (Platform.OS !== 'android') {
        return null;
    }
    return <AndroidPermissionSection />;
}

/**
 * 每行都写清「不给会怎样」——这是一组排障用的行，只报状态不说后果的话，
 * 用户没有理由去开它
 */
function AndroidPermissionSection(): ReactElement {
    const t = useT();
    const battery = useSystemGateGranted(() =>
        systemGates.isIgnoringBatteryOptimizations(),
    );
    const storage = useSystemGateGranted(
        async () => (await checkStorageReadAccess()) === 'granted',
    );
    const overlay = useSystemGateGranted(() => systemGates.canDrawOverlays());

    // 授予态未知（首帧还没查完）时尾部留空，不硬说成「未授予」
    const statusOf = (granted: boolean | undefined): string | undefined =>
        granted === undefined
            ? undefined
            : t(
                  granted
                      ? 'settings.permission.granted'
                      : 'settings.permission.notGranted',
              );

    const failed = (): void => {
        showToast(t('feedback.operationFailed'), { type: 'error' });
    };

    // 跳系统设置失败（无对应 Activity 等）才提示；用户授不授是他的事，不催
    const openSettingsPage =
        (open: () => Promise<unknown>) => async (): Promise<void> => {
            try {
                await open();
            } catch {
                failed();
            }
        };

    /**
     * 存储比另外两道门多一步：Android 10 及以下弹的是运行时权限窗，结果由返回值给出
     * （不保证经过一次前后台切换），且永久拒绝后再请求不会有任何反应——只能改跳系统设置页
     */
    const requestStorage = async (): Promise<void> => {
        try {
            if ((await requestStorageReadAccess()) === 'blocked') {
                await openStorageSettings();
            }
        } catch {
            failed();
        } finally {
            storage.refresh();
        }
    };

    return (
        <Section title={t('settings.permission.section')}>
            <ActionRow
                label={t('settings.permission.battery')}
                description={t('settings.permission.batteryHint')}
                value={statusOf(battery.granted)}
                onPress={openSettingsPage(() =>
                    systemGates.requestIgnoreBatteryOptimizations(),
                )}
            />
            <ActionRow
                label={t('settings.permission.storage')}
                description={t('settings.permission.storageHint')}
                value={statusOf(storage.granted)}
                onPress={requestStorage}
            />
            <ActionRow
                label={t('settings.permission.overlay')}
                description={t('settings.permission.overlayHint')}
                value={statusOf(overlay.granted)}
                onPress={openSettingsPage(() =>
                    systemGates.openOverlaySettings(),
                )}
            />
        </Section>
    );
}
