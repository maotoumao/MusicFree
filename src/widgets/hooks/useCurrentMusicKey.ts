import { useCurrentMusic } from '@/core/player';
import { mediaKey } from '@/utils/media';

/**
 * 当前曲的 mediaKey（无当前曲为 null）
 *
 * 给 MediaList 的 `locateKey` 用：那一层是纯 UI、不能 import core，
 * 「当前曲是谁」必须由 widgets / pages 这一侧喂进去。抽成 hook 是因为四个列表都要，
 * 各写一遍 `useCurrentMusic()` + `mediaKey()` 只会让这条接线在四处各错一次
 */
export function useCurrentMusicKey(): string | null {
    const current = useCurrentMusic();
    return current == null ? null : mediaKey(current);
}
