import { MediaCover } from '@/components/ui/MediaCover';
import { useLocalMusicCover } from '@/widgets/hooks/useLocalMusicCover';

import type { IconName } from '@/components/ui/icons.generated';
import type { MediaRef } from '@/types';

/**
 * 本地集合封面：惰性 resolveCover 出 uri，交 MediaCover 渲染（surfaceVariant 底 + 语义图标兜底）
 * 传 size = 固定边长（列表行 leading）；不传 = 撑满父宽的正方形（网格 cell）
 */
export function CollectionCover({
    coverRef,
    fallbackIcon,
    size,
    round = false,
}: {
    coverRef?: MediaRef;
    fallbackIcon: IconName;
    size?: number;
    round?: boolean;
}) {
    const source = useLocalMusicCover(coverRef);
    return (
        <MediaCover
            source={source}
            fallbackIcon={fallbackIcon}
            size={size}
            round={round}
        />
    );
}
