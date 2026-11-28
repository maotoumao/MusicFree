import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

import { showToast } from '@/components/overlay';
import { useT } from '@/i18n';

import type { ScanStatus } from '@/core/localMusic';

const SCANNING: ReadonlySet<ScanStatus> = new Set<ScanStatus>([
    'enumerating',
    'scanning',
]);

/**
 * 扫描状态变迁的用户反馈：进入扫描/终态时 a11y 播报；有库时终态额外 toast（列表视觉无变时补提示）
 * 只依赖 status（不订阅每批进度），状态真正变化才触发；首扫与重扫一视同仁；挂载不误报
 */
export function useScanFeedback(status: ScanStatus, hasLibrary: boolean): void {
    const t = useT();
    const prev = useRef(status);
    useEffect(() => {
        const from = prev.current;
        prev.current = status;
        if (from === status) {
            return;
        }
        if (SCANNING.has(status)) {
            if (!SCANNING.has(from)) {
                AccessibilityInfo.announceForAccessibility(
                    t('localMusic.a11y.scanStarted'),
                );
            }
            return;
        }
        switch (status) {
            // 有库终态用 Toast（自带读屏播报、不再 announce 免重复）；无库终态由扫描控制台 lastResult 承载
            case 'completed':
                if (hasLibrary) {
                    showToast(t('localMusic.scan.libraryUpdated'), {
                        type: 'success',
                    });
                }
                break;
            case 'cancelled':
                if (hasLibrary) {
                    showToast(t('localMusic.scan.cancelled'), { type: 'info' });
                }
                break;
            case 'failed':
                // 失败有旧库：轻量 toast「未更新」（自带读屏播报）；无库失败由控制台 lastResult 标题焦点承载，不再显式 announce 免重复打断
                if (hasLibrary) {
                    showToast(t('localMusic.scan.notUpdated'), {
                        type: 'info',
                    });
                }
                break;
        }
    }, [status, hasLibrary, t]);
}
