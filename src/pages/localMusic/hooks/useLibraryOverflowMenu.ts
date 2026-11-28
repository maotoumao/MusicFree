import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import {
    localMusic,
    useLocalMusicList,
    useScanStatus,
} from '@/core/localMusic';
import { useT } from '@/i18n';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import { rescanRequestedAtom } from '../store';

/**
 * 有库列表态的 AppBar 更多菜单：重新扫描 + 清空本地音乐库（危险、二次确认）
 * 仅有库且非扫描中才返回菜单动作；其余态返回 undefined，AppBar 据此不渲染 ⋮
 */
export function useLibraryOverflowMenu(): { onPress: () => void } | undefined {
    const t = useT();
    const musicList = useLocalMusicList();
    const status = useScanStatus();
    const setRescanRequested = useSetAtom(rescanRequestedAtom);
    const hasLibrary = musicList.length > 0;
    const scanning = status === 'enumerating' || status === 'scanning';
    const count = musicList.length;

    const confirmClear = useCallback(() => {
        showConfirmDialog({
            title: t('localMusic.menu.clearConfirm.title'),
            message: t('localMusic.menu.clearConfirm.message', { count }),
            confirmText: t('localMusic.menu.clearLibrary'),
            danger: true,
        })
            .then(ok => {
                if (ok) {
                    localMusic.clearLibrary();
                }
            })
            .catch(() => {});
    }, [t, count]);

    const openMenu = useCallback(() => {
        showActionSheetPanel({
            items: [
                {
                    icon: 'refresh-cw',
                    label: t('localMusic.scan.rescan'),
                    // 置重扫请求 → 扫描控制台重扫态（不立即扫描，用户在控制台确认范围后再开始）
                    onPress: () => setRescanRequested(true),
                },
                {
                    icon: 'trash-2',
                    label: t('localMusic.menu.clearLibrary'),
                    danger: true,
                    separatorBefore: true,
                    onPress: confirmClear,
                },
            ],
        });
    }, [t, confirmClear, setRescanRequested]);

    if (!hasLibrary || scanning) {
        return undefined;
    }
    return { onPress: openMenu };
}
