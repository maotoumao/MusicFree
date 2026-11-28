import { useT } from '@/i18n';

/** 扫描控制台上下文：首次（无库）/ 重扫（有库覆盖列表，附当前曲数）/ 上次结果（无库终态，按原因） */
export type ScanConsoleContext =
    | { kind: 'first' }
    | { kind: 'rescan'; count: number }
    | { kind: 'lastResult'; reason: 'empty' | 'cancelled' | 'failed' };

/** 按上下文取标题/说明/主按钮标签与读屏名（首次·重扫用同一发起文案，上次结果按原因给安静提示 + 重试） */
export function useConsoleCopy(context: ScanConsoleContext) {
    const t = useT();
    if (context.kind === 'lastResult') {
        const { reason } = context;
        return {
            title:
                reason === 'failed'
                    ? t('localMusic.scan.failedTitle')
                    : reason === 'cancelled'
                    ? t('localMusic.scan.cancelled')
                    : t('localMusic.empty.title'),
            description:
                reason === 'failed'
                    ? t('localMusic.scan.failedDescription')
                    : reason === 'cancelled'
                    ? t('localMusic.scan.cancelledDescription')
                    : t('localMusic.empty.description'),
            primaryLabel: t('localMusic.scan.retry'),
            primaryA11y: t('localMusic.scan.retry'),
        };
    }
    return {
        title: t('localMusic.scanGate.title'),
        description: t('localMusic.scanGate.description'),
        primaryLabel: t('localMusic.scanGate.start'),
        primaryA11y:
            context.kind === 'rescan'
                ? t('localMusic.scan.rescan')
                : t('localMusic.scanGate.a11y.start'),
    };
}
