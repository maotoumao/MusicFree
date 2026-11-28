import { useCallback } from 'react';

import { definePanel, useOverlayStatus } from '@/components/overlay';
import { PluginDetails } from '@/widgets/PluginDetails';

import type { OverlayProps } from '@/components/overlay';

export interface PluginDetailsOptions {
    /** 目标插件公开身份；实体与设置在 Panel 内经 live hooks 取 */
    platform: string;
}

/**
 * 插件详情 Panel（手机 / 竖屏平板）：正文在 widgets/PluginDetails，
 * 平板横屏由插件管理页右栏常驻承载同一份正文；壳只管 overlay 生命周期
 */
function PluginDetailsPanelView({
    payload,
    close,
}: OverlayProps<PluginDetailsOptions, void>) {
    const status = useOverlayStatus();
    // 面板里只有这一个插件，没了就关；引用稳定，免得正文的 effect 每帧重跑
    const onGone = useCallback(() => close(), [close]);
    return (
        <PluginDetails
            platform={payload.platform}
            active={status.active}
            onGone={onGone}
        />
    );
}

/** 插件详情 Panel：core-aware 聚合入口，只收 platform，内部 live 读 + 命令落盘 */
export const showPluginDetailsPanel = definePanel(PluginDetailsPanelView);
