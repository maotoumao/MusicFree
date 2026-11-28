import { useAtomValue } from 'jotai';

import { useLocalMusicList, useScanStatus } from '@/core/localMusic';

import { rescanRequestedAtom } from '../store';

/**
 * 重扫控制台是否激活 = 请求重扫 && 有库 && 未在扫描
 * 内容层与 AppBar/返回/overflow 共用同一判定，避免「请求置真但内容态不匹配」时视图与返回语义打架
 */
export function useRescanActive(): boolean {
    const rescanRequested = useAtomValue(rescanRequestedAtom);
    const musicList = useLocalMusicList();
    const status = useScanStatus();
    const hasLibrary = musicList.length > 0;
    const scanning = status === 'enumerating' || status === 'scanning';
    return rescanRequested && hasLibrary && !scanning;
}
