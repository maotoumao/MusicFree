import { useEffect, useState } from 'react';

import { localMusic } from '@/core/localMusic';
import { mediaKey } from '@/utils/media';

import type { MediaRef } from '@/types';

/**
 * 惰性解析本地曲封面 → 可显示 uri（无 ref / 无封面 / 失败 → undefined）
 * 本地专用（走 localMusic.resolveCover，缓存约定 + exists 自愈）；概览封面与集合详情头共用
 * 结果绑 ref 身份（mediaKey）：ref 切换（含 FlashList cell 回收复用）立即回 undefined、不闪上一个封面
 * 图片由 expo-image 缓存
 */
export function useLocalMusicCover(
    ref: Readonly<MediaRef> | undefined,
): string | undefined {
    const refKey = ref ? mediaKey(ref) : undefined;
    const [resolved, setResolved] = useState<{ key: string; uri: string }>();
    useEffect(() => {
        if (!ref || !refKey) {
            return;
        }
        let alive = true;
        localMusic
            .resolveCover(ref)
            .then(uri => {
                if (alive && uri) {
                    setResolved({ key: refKey, uri });
                }
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 按 ref 身份（refKey）触发；ref 从 refKey 同步派生，用对象引用会每次 render 重解析
    }, [refKey]);
    // 只返回与当前 ref 身份匹配的结果：ref 切换时立即回到 undefined、不闪上一个封面
    return resolved && resolved.key === refKey ? resolved.uri : undefined;
}
