import { useCallback, useState } from 'react';

import { localMusic } from '@/core/localMusic';
import { isAtOrUnderDir } from '@/utils/path';

import type { ScanSettings } from '@/core/localMusic';

/** 「过滤小于 N 秒」开启时的阈值秒数（关闭 = 0） */
export const SHORT_AUDIO_SEC = 60;
/** 最小文件大小可选档（字节）；0 = 不限 */
export const MIN_SIZE_CHOICES = [0, 1, 5, 10].map(mb => mb * 1024 * 1024);

/** 选中目录的去向 */
export type ScanDirTarget = 'included' | 'excluded';

function sameList(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((x, i) => x === b[i]);
}

function sameSettings(a: ScanSettings, b: ScanSettings): boolean {
    return (
        a.mode === b.mode &&
        a.minDurationSec === b.minDurationSec &&
        a.minSizeBytes === b.minSizeBytes &&
        sameList(a.includedDirs, b.includedDirs) &&
        sameList(a.excludedDirs, b.excludedDirs)
    );
}

/**
 * 与用户**自己加的扫描目录**冲突的排除目录：某排除项等于或高于某个已加目录
 * 那是自相矛盾的配置（既要扫又要排除），保存前拦下来让用户二选一
 *
 * 只看 custom 模式的已加目录，**不看全盘模式的存储卷根**：全盘模式下
 * 「排除项盖住某个卷根」是合法且有用的配置（全盘扫描但别碰这张卡），
 * core 会把那个根整个摘掉、其下条目照常清出库（见 lib/scanRoots 与设计 §3.4），
 * 拿卷根当冲突会让这种配置永远存不下来
 */
function conflictsOf(draft: ScanSettings): readonly string[] {
    if (draft.mode !== 'custom') {
        return [];
    }
    return draft.excludedDirs.filter(ex =>
        draft.includedDirs.some(dir => isAtOrUnderDir(dir, ex)),
    );
}

/**
 * 管理扫描范围页的编辑态：进页从当前 scanSettings 初始化 draft，所有编辑只改 draft
 * 「保存」落库 draft（不触发扫描，扫描发起统一在控制台）；hasChanges/conflict 供 UI 门控
 */
export function useDraftScanSettings() {
    // 进页快照 + 局部编辑态（同步初始化，首帧即非空）；管理页 push 目录浏览器时保留、回传经 route param 消费
    const [saved] = useState(() => localMusic.getScanSettings());
    const [draft, setDraft] = useState<ScanSettings>(saved);

    const patch = useCallback((p: Partial<ScanSettings>) => {
        setDraft(prev => ({ ...prev, ...p }));
    }, []);

    const setMode = useCallback(
        (mode: ScanSettings['mode']) => patch({ mode }),
        [patch],
    );

    const setShortAudioFilter = useCallback(
        (on: boolean) => patch({ minDurationSec: on ? SHORT_AUDIO_SEC : 0 }),
        [patch],
    );

    const setMinSizeBytes = useCallback(
        (minSizeBytes: number) => patch({ minSizeBytes }),
        [patch],
    );

    const addDir = useCallback((target: ScanDirTarget, path: string) => {
        setDraft(prev => {
            const key = target === 'included' ? 'includedDirs' : 'excludedDirs';
            if (prev[key].includes(path)) {
                return prev;
            }
            const next = { ...prev, [key]: [...prev[key], path] };
            // 添加扫描目录即表明要用「指定文件夹」，自动切到 custom
            if (target === 'included') {
                next.mode = 'custom';
            }
            return next;
        });
    }, []);

    const removeDir = useCallback((target: ScanDirTarget, path: string) => {
        setDraft(prev => {
            const key = target === 'included' ? 'includedDirs' : 'excludedDirs';
            return { ...prev, [key]: prev[key].filter(p => p !== path) };
        });
    }, []);

    // 自相矛盾的配置（已加的扫描目录被自己的排除项盖住）；纯本地判定，不必问设备卷
    const conflictDirs = conflictsOf(draft);

    const hasChanges = !sameSettings(draft, saved);

    // 保存：落库 draft（不触发扫描，扫描发起统一在控制台）
    const saveSettings = useCallback(() => {
        localMusic.setScanSettings({
            mode: draft.mode,
            minDurationSec: draft.minDurationSec,
            minSizeBytes: draft.minSizeBytes,
            includedDirs: draft.includedDirs,
            excludedDirs: draft.excludedDirs,
        });
    }, [draft]);

    return {
        draft,
        setMode,
        setShortAudioFilter,
        setMinSizeBytes,
        addDir,
        removeDir,
        conflictDirs,
        hasChanges,
        saveSettings,
    };
}
