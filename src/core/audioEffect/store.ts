/**
 * 音效模块运行时反应式态（jotai atoms，AudioEffect 类是唯一 writer）
 * available / bandMeta / presets 来自设备、setup 时加载一次、不持久化
 * enabled / gains / preset 是持久化配置（真相在 config）的反应式镜像：类每次动作同步写 atom + config
 * （这些 config 键仅本模块写、原生不碰，故镜像 atom 不会漏掉外部写）
 */
import { atom } from 'jotai';

import type { EqualizerBandMeta } from './types';

/** 均衡器是否可用（设备支持且实例建成）；setup 后确定，false = 隐藏入口 */
export const equalizerAvailableAtom = atom(false);

/** 设备频段元信息（序号 / 中心频率 / 增益范围）；setup 加载一次 */
export const equalizerBandMetaAtom = atom<readonly EqualizerBandMeta[]>([]);

/** 系统内置预设英文名列表；setup 加载一次 */
export const equalizerPresetsAtom = atom<readonly string[]>([]);

/** 均衡器开关（反应式镜像） */
export const equalizerEnabledAtom = atom(false);

/** 各频段当前增益（millibel，按频段序号）；反应式镜像 */
export const equalizerGainsAtom = atom<readonly number[]>([]);

/** 选中预设英文名；null = 自定义（手动调过增益 / 重置后） */
export const equalizerPresetAtom = atom<string | null>(null);
