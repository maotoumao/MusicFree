/**
 * 歌曲侧工具的共享判据（收藏 / 音质 / 倍速或均衡器 / 下载 / 评论）
 *
 * 竖屏是封面工具行的六个按钮，短窗口是顶栏溢出菜单的几行——摆法不同，但「能不能用」
 * 的判据必须是同一份。歌词侧就因为各写一份而静悄悄少过四个动作（见 [useLyricMoreItems]），
 * 这里先把判据收拢，两个组件只负责摆放与各自的导航回调
 */
import { useCallback } from 'react';

import { showToast } from '@/components/overlay';
import { useEqualizerAvailable } from '@/core/audioEffect';
import { isDownloadSupported } from '@/core/download';
import { useHasLocalFile } from '@/core/mediaMeta';
import {
    useCurrentMusic,
    usePlaybackRate,
    usePreferredQuality,
} from '@/core/player';
import { playlist, useIsFavorite } from '@/core/playlist';
import { usePlugin } from '@/core/plugin';
import { useT } from '@/i18n';
import { isLocalPlatform } from '@/utils/media';
import { useRequestDownload } from '@/widgets/hooks/useRequestDownload';

import type { MusicItem, QualityKey } from '@/types';

/** currentMusic 为空时的占位 ref：查无 → false（hook 需无条件调用） */
const NO_REF = { platform: '', id: '' };

export interface NowPlayingSongTools {
    currentMusic: MusicItem | null;
    isFavorited: boolean;
    /** 当前态由 core 在串行队列内读取，连点不会丢掉一次翻转 */
    toggleFavorite: () => void;
    quality: QualityKey;
    rate: number;
    /** 均衡器可用时倍速让位给它（倍速改由「更多」面板给出） */
    eqAvailable: boolean;
    /** 本地来源：无插件音源，下载与音质都无从谈起 */
    isLocal: boolean;
    downloaded: boolean;
    canDownload: boolean;
    requestDownload: (item: MusicItem) => void;
    /** 插件是否支持评论；不支持时置灰而非隐藏，让能力差异可见 */
    supportsComment: boolean;
}

export function useNowPlayingSongTools(): NowPlayingSongTools {
    const t = useT();
    const currentMusic = useCurrentMusic();
    const isFavorited = useIsFavorite(currentMusic ?? NO_REF);
    const quality = usePreferredQuality();
    const rate = usePlaybackRate();
    const eqAvailable = useEqualizerAvailable();
    const plugin = usePlugin(currentMusic?.platform ?? '');
    const supportsComment =
        currentMusic != null &&
        (plugin?.supportedMethods.has('getMusicComments') ?? false);

    // 下载只表达「已下载 / 未下载」两态，中间态靠 toast 回执
    // 本地来源的歌本就在设备上；与 iOS 无下载引擎一样置灰
    const requestDownload = useRequestDownload();
    const isLocal = isLocalPlatform(currentMusic?.platform);
    const hasLocalFile = useHasLocalFile(currentMusic ?? NO_REF);
    const downloaded = !isLocal && hasLocalFile;
    const canDownload = currentMusic != null && !isLocal && isDownloadSupported;

    const toggleFavorite = useCallback(() => {
        if (!currentMusic) {
            return;
        }
        playlist
            .toggleFavorite(currentMusic)
            .catch(() =>
                showToast(t('feedback.operationFailed'), { type: 'error' }),
            );
    }, [currentMusic, t]);

    return {
        currentMusic,
        isFavorited,
        toggleFavorite,
        quality,
        rate,
        eqAvailable,
        isLocal,
        downloaded,
        canDownload,
        requestDownload,
        supportsComment,
    };
}
