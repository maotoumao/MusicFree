import {
    useMutation,
    useMutationState,
    useQueryClient,
} from '@tanstack/react-query';

import { showToast } from '@/components/overlay';
import { useT } from '@/i18n';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import {
    clearExpoImageCache,
    clearStreamingCacheAndUpdate,
} from '../lib/cacheActions';

const CLEAR_CACHE_MUTATION_KEY = ['settings', 'clearCache'] as const;

type ClearCacheTarget = 'music' | 'image';

interface ClearCacheRequest {
    target: ClearCacheTarget;
    title: string;
    message: string;
    successMessage: string;
}

/**
 * 两类缓存清理的页面级编排；进行中状态来自 MutationCache，离开再进设置页也不会丢锁
 */
export function useClearCaches() {
    const t = useT();
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationKey: CLEAR_CACHE_MUTATION_KEY,
        mutationFn: async (request: ClearCacheRequest): Promise<void> => {
            try {
                const confirmed = await showConfirmDialog({
                    title: request.title,
                    message: request.message,
                    confirmText: t('common.clear'),
                });
                if (!confirmed) {
                    return;
                }
                if (request.target === 'music') {
                    await clearStreamingCacheAndUpdate(queryClient);
                } else {
                    await clearExpoImageCache();
                }
                showToast(request.successMessage, { type: 'success' });
            } catch {
                showToast(t('feedback.operationFailed'), { type: 'error' });
            }
        },
    });
    const activeTargets = useMutationState<ClearCacheTarget | undefined>({
        filters: {
            mutationKey: CLEAR_CACHE_MUTATION_KEY,
            status: 'pending',
        },
        select: active =>
            (active.state.variables as ClearCacheRequest | undefined)?.target,
    });
    const clearing = activeTargets[activeTargets.length - 1] ?? null;
    const operationPending = clearing !== null;

    const start = (request: ClearCacheRequest): void => {
        // MutationCache 是跨挂载真相源；同步查一次也挡住同一帧快速连点
        const alreadyPending =
            queryClient.getMutationCache().findAll({
                mutationKey: CLEAR_CACHE_MUTATION_KEY,
                exact: true,
                status: 'pending',
            }).length > 0;
        if (!alreadyPending) {
            mutation.mutate(request);
        }
    };

    return {
        clearing,
        operationPending,
        clearMusicCache: () =>
            start({
                target: 'music',
                title: t('settings.cache.music.clear'),
                message: t('settings.cache.music.confirm'),
                successMessage: t('settings.cache.music.cleared'),
            }),
        clearImageCache: () =>
            start({
                target: 'image',
                title: t('settings.cache.image.clear'),
                message: t('settings.cache.image.confirm'),
                successMessage: t('settings.cache.image.cleared'),
            }),
    };
}
