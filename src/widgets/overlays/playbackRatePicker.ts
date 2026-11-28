/**
 * 倍速选择器：底部 action sheet 列出倍率档，勾选当前档，点选即写 player
 * 供正在播放页封面工具行与单曲「更多」面板复用（避免各自内联重复）
 */
import { player } from '@/core/player';
import { t } from '@/i18n';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';

import type { ActionSheetItem } from '@/widgets/overlays/ActionSheetPanel';

/** 可选倍率档 */
const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** 倍率数字 → 展示（整数省略小数：1→1、1.25→1.25、1.5→1.5） */
function formatRate(rate: number): string {
    return rate.toFixed(2).replace(/0$/, '');
}

/** 倍率 → 带 × 的标签（如 1.5×），供工具按钮 / 列表行展示当前值 */
export function formatPlaybackRate(rate: number): string {
    return `${formatRate(rate)}×`;
}

/** 打开倍速选择器；current 用于勾选当前档 */
export function showPlaybackRatePicker(current: number): void {
    const items: ActionSheetItem[] = RATE_OPTIONS.map(option => ({
        label: `${formatRate(option)}×`,
        selected: option === current,
        onPress: () => {
            player.setPlaybackRate(option).catch(() => {});
        },
    }));
    showActionSheetPanel({ title: t('media.playbackRate'), items });
}
