import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { showToast } from '@/components/overlay';
import { localMusic } from '@/core/localMusic';
import { useT } from '@/i18n';

import type { StorageAccessStatus } from '@/infra/permission';

/**
 * 存储读权限态：挂载即查、回前台自动复检
 * R+ 授权在系统设置里完成（无运行时弹窗），request 返回即时快照通常仍 denied，最终态靠回前台复检收敛到 granted
 * blocked（≤10 永久拒绝）时 request 改跳系统设置页，同样靠回前台复检收敛
 */
export function useStorageReadAccess(): {
    status: StorageAccessStatus | undefined;
    requesting: boolean;
    request: () => Promise<void>;
} {
    const t = useT();
    const [status, setStatus] = useState<StorageAccessStatus | undefined>(
        undefined,
    );
    const [requesting, setRequesting] = useState(false);
    const mounted = useRef(true);
    const inFlight = useRef(false);

    useEffect(() => {
        mounted.current = true;
        const sync = (): void => {
            localMusic.checkPermission().then(
                s => mounted.current && setStatus(s),
                () => mounted.current && setStatus('denied'), // 查询失败按未授予处理，停在权限门
            );
        };
        sync();
        const sub = AppState.addEventListener('change', state => {
            if (state === 'active') {
                sync();
            }
        });
        return () => {
            mounted.current = false;
            sub.remove();
        };
    }, []);

    const request = useCallback(async (): Promise<void> => {
        if (inFlight.current) {
            return; // 进行中不重复发起（防连点起多次请求）
        }
        inFlight.current = true;
        setRequesting(true);
        try {
            if (status === 'blocked') {
                // ≤10 永久拒绝：request 不再弹窗，只能去系统设置手动开
                await localMusic.openPermissionSettings();
            } else {
                const s = await localMusic.requestPermission();
                if (mounted.current) {
                    setStatus(s);
                }
            }
        } catch {
            showToast(t('localMusic.permission.openSettingsFailed'), {
                type: 'error',
            });
        } finally {
            inFlight.current = false;
            if (mounted.current) {
                setRequesting(false);
            }
        }
    }, [status, t]);

    return { status, requesting, request };
}
