/**
 * 音质选择器：底部 action sheet 列出音质档，勾选当前档，点选即写 player
 * 供正在播放页的封面工具行与短窗口工具菜单复用（避免各自内联重复）
 */
import { player } from '@/core/player';
import { t } from '@/i18n';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';

import type { QualityKey } from '@/types';
import type { ActionSheetItem } from '@/widgets/overlays/ActionSheetPanel';

/**
 * 展示顺序（低→高）；与 utils/media 导出的 QUALITY_KEYS 刻意不同名——
 * 那是回退算法的排位（source 解析按它就近升降），这里只是给人看的档序
 */
const QUALITY_ORDER: readonly QualityKey[] = [
    'low',
    'standard',
    'high',
    'super',
];

/** 打开音质选择器；current 用于勾选当前档 */
export function showQualityPicker(current: QualityKey): void {
    const items: ActionSheetItem[] = QUALITY_ORDER.map(key => ({
        label: t(`media.quality.${key}`),
        selected: key === current,
        onPress: () => {
            player.setPreferredQuality(key).catch(() => {});
        },
    }));
    showActionSheetPanel({ title: t('musicDetail.quality'), items });
}
