/**
 * 音效反应式读取层（React hooks）：只读 store atoms，写全走命令式 audioEffect.xxx
 * bands 合并「设备元信息 + 当前增益」为一根滑块所需的完整数据
 */
import { useAtomValue } from 'jotai';
import { useMemo } from 'react';

import {
    equalizerAvailableAtom,
    equalizerBandMetaAtom,
    equalizerEnabledAtom,
    equalizerGainsAtom,
    equalizerPresetAtom,
    equalizerPresetsAtom,
} from './store';

import type { EqualizerBand } from './types';

/** 均衡器是否可用（false 时入口应隐藏） */
export function useEqualizerAvailable(): boolean {
    return useAtomValue(equalizerAvailableAtom);
}

/** 均衡器开关态 */
export function useEqualizerEnabled(): boolean {
    return useAtomValue(equalizerEnabledAtom);
}

/** 选中预设英文名；null = 自定义 */
export function useEqualizerPreset(): string | null {
    return useAtomValue(equalizerPresetAtom);
}

/** 系统内置预设英文名列表 */
export function useEqualizerPresets(): readonly string[] {
    return useAtomValue(equalizerPresetsAtom);
}

/** 各频段（元信息 + 当前增益）；增益变化时重算，元信息不变则复用 */
export function useEqualizerBands(): readonly EqualizerBand[] {
    const meta = useAtomValue(equalizerBandMetaAtom);
    const gains = useAtomValue(equalizerGainsAtom);
    return useMemo(
        () => meta.map((m, i) => ({ ...m, gain: gains[i] ?? 0 })),
        [meta, gains],
    );
}
