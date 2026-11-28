/**
 * 音效入口行尾部显示的当前状态：已关闭 / 预设名 / 自定义
 * 设备不支持时不给摘要——那不是一种「当前设置」，解释留给面板自己
 *
 * 独立于面板：设置页的入口行要它，而入口不该反过来依赖面板模块
 */
import {
    useEqualizerAvailable,
    useEqualizerEnabled,
    useEqualizerPreset,
} from '@/core/audioEffect';
import { useT } from '@/i18n';
import { useEqualizerPresetLabel } from '@/widgets/hooks/useEqualizerPresetLabel';

export function useEqualizerSummary(): string | undefined {
    const t = useT();
    const presetLabel = useEqualizerPresetLabel();
    const available = useEqualizerAvailable();
    const enabled = useEqualizerEnabled();
    const preset = useEqualizerPreset();
    if (!available) {
        return undefined;
    }
    if (!enabled) {
        return t('equalizerPanel.off');
    }
    return preset === null ? t('equalizerPanel.custom') : presetLabel(preset);
}
