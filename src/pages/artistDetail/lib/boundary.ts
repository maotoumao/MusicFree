import type { ArtistDetailSource } from '../hooks/useArtistDetailSource';
import type { ContentUnavailableProps } from '@/components/ui/ContentUnavailable';
import type { useT } from '@/i18n';
import type { ArtistItem } from '@/types';

/**
 * 边界态 → ContentUnavailable 配置（null = 非边界，走作品编排）
 * 纯映射：据 item 有无 + pageState 给图标 / 文案 / 是否可重试；无副作用，故随 index 装配抽到 lib
 */
export function resolveBoundary(
    item: ArtistItem | undefined,
    source: ArtistDetailSource,
    t: ReturnType<typeof useT>,
): ContentUnavailableProps | null {
    // ticket 失效 / 被消费 / 领取失败：无 ArtistItem（页面无内容，非「远端找不到」）
    if (item == null) {
        return { icon: 'inbox', title: t('artistDetail.nothingHere') };
    }
    switch (source.pageState) {
        case 'error':
            // platform 无对应插件（插件缺失）：重试无法装插件，故不给重试
            return {
                icon: 'triangle-alert',
                title: t('artistDetail.sourceMissing'),
                description: t('artistDetail.sourceMissingHint'),
            };
        case 'unavailable':
            // 插件在但不支持 getArtistWorks（能力缺失）：同样无从重试
            return {
                icon: 'triangle-alert',
                title: t('artistDetail.unsupported'),
            };
        case 'empty':
            return { icon: 'inbox', title: t('artistDetail.emptyWorks') };
        default:
            return null;
    }
}
