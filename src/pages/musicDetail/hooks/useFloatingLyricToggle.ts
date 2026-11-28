/**
 * 桌面歌词工具按钮逻辑：读开关态、切换（走 core.enable/disable，权限流程在 core）、打开设置面板
 * 仅 Android 有桌面歌词；调用方用 os 守卫是否渲染按钮
 */
import { useCallback } from 'react';

import { config, useConfig } from '@/core/config';
import { floatingLyric } from '@/core/floatingLyric';
import { showFloatingLyricSettingsPanel } from '@/widgets/overlays/FloatingLyricSettingsPanel';

export function useFloatingLyricToggle() {
    const enabled = useConfig('floatingLyric.enabled') ?? false;

    const toggle = useCallback(() => {
        // 开关走 core 命令：enable 内含权限检查与引导、防连点，disable 直接关
        if (config.get('floatingLyric.enabled') ?? false) {
            floatingLyric.disable();
        } else {
            floatingLyric.enable().catch(e => {
                if (__DEV__) {
                    console.warn('[floatingLyric] enable 失败', e);
                }
            });
        }
    }, []);

    const openSettings = useCallback(() => {
        showFloatingLyricSettingsPanel();
    }, []);

    return { enabled, toggle, openSettings };
}
