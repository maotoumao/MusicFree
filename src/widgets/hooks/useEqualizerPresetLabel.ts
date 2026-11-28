/**
 * 系统均衡器预设的展示名：设备给的是英文原名（Normal / Heavy Metal…），这里映射成本地化文案
 * 表内没有的名字（OEM 自定义预设）原样显示，不猜也不隐藏
 *
 * 独立于面板：面板的预设 Chip 与设置页的入口摘要都要它，两处必须同名，
 * 否则会出现「面板显示『摇滚』、设置行显示『Rock』」的漂移
 */
import { useT } from '@/i18n';

import type { PlainKey } from '@/i18n';

/** 系统预设英文原名 → i18n key */
const PRESET_KEY = {
    Normal: 'equalizerPanel.presets.normal',
    Classical: 'equalizerPanel.presets.classical',
    Dance: 'equalizerPanel.presets.dance',
    Folk: 'equalizerPanel.presets.folk',
    'Heavy Metal': 'equalizerPanel.presets.heavyMetal',
    'Hip Hop': 'equalizerPanel.presets.hipHop',
    Jazz: 'equalizerPanel.presets.jazz',
    Pop: 'equalizerPanel.presets.pop',
    Rock: 'equalizerPanel.presets.rock',
} satisfies Record<string, PlainKey>;

/** 取「英文原名 → 展示名」的映射函数；随语言变化 */
export function useEqualizerPresetLabel(): (name: string) => string {
    const t = useT();
    return name => {
        const key = (PRESET_KEY as Record<string, PlainKey>)[name];
        return key ? t(key) : name;
    };
}
