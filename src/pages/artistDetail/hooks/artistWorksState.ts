import type { ArtistMediaType } from '@/types';

/** 页面级态：领取 ticket / 首屏加载 / 就绪 / 失效 / 两类都空 / 方法缺失 */
export type ArtistPageState =
    | 'loading'
    | 'ready'
    | 'error'
    | 'empty'
    | 'unavailable';

/** 单类作品的证据态：据缓存 data + 首屏错误派生，不被后台刷新失败（isRefetchError）推翻 */
export type WorkEvidence =
    | 'unprobed'
    | 'loading'
    | 'present'
    | 'empty'
    | 'error';

/**
 * 据缓存证据（非当前刷新状态）判定一类作品的存在性：
 * data 已到（成功过）→ 有项=present、空但还有下一页=loading（未确认空）、空且到底=empty；
 * 未成功过 → 首屏错误=error、否则 loading；未启用（album 未探测）=unprobed
 */
export function evidenceOf(
    enabled: boolean,
    hasData: boolean,
    itemCount: number,
    hasNextPage: boolean,
    isLoadingError: boolean,
): WorkEvidence {
    if (!enabled) {
        return 'unprobed';
    }
    if (hasData) {
        if (itemCount > 0) {
            return 'present';
        }
        return hasNextPage ? 'loading' : 'empty';
    }
    return isLoadingError ? 'error' : 'loading';
}

// 稳定引用的 tab 组合（相同结果同引用，利于 useMemo 下游）
const NO_TYPES: readonly ArtistMediaType[] = [];
const ALBUM_ONLY: readonly ArtistMediaType[] = ['album'];
const BOTH_TYPES: readonly ArtistMediaType[] = ['music', 'album'];

/** 据两类证据派生应显示的 tab：music 有内容 / 失败 → 恒显示 music + album 两 tab（album 空由其列表显空态、不隐藏 tab、免用户切后弹回）；music 空 → 仅 album 存在 / 失败时显示 album */
export function deriveVisibleTypes(
    canLoad: boolean,
    musicEvidence: WorkEvidence,
    albumEvidence: WorkEvidence,
): readonly ArtistMediaType[] {
    if (!canLoad) {
        return NO_TYPES;
    }
    if (musicEvidence === 'present' || musicEvidence === 'error') {
        return BOTH_TYPES;
    }
    if (musicEvidence === 'empty') {
        return albumEvidence === 'present' || albumEvidence === 'error'
            ? ALBUM_ONLY
            : NO_TYPES;
    }
    return NO_TYPES; // music 首屏加载中
}

/** 据 pending / 实体 / 能力 / 可见 tab 数 / 两类证据派生页面级态 */
export function derivePageState(
    pending: boolean,
    hasItem: boolean,
    hasPlugin: boolean,
    canGetWorks: boolean,
    visibleCount: number,
    musicEvidence: WorkEvidence,
    albumEvidence: WorkEvidence,
): ArtistPageState {
    if (pending) {
        return 'loading';
    }
    if (!hasItem || !hasPlugin) {
        return 'error';
    }
    if (!canGetWorks) {
        return 'unavailable';
    }
    if (visibleCount > 0) {
        return 'ready';
    }
    // visibleTypes 空：区分「仍在加载」与「都空」
    if (musicEvidence === 'loading') {
        return 'loading';
    }
    if (
        musicEvidence === 'empty' &&
        (albumEvidence === 'loading' || albumEvidence === 'unprobed')
    ) {
        return 'loading';
    }
    return 'empty';
}
