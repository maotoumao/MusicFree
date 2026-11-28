import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

import { useConfig } from '@/core/config';
import { acquireKeepAwake, releaseKeepAwake } from '@/infra/keepAwake';

/** 本页持有的常亮 tag，与其他持有方互不干扰 */
const KEEP_AWAKE_TAG = 'musicDetail';

/**
 * 按配置在本页停留期间保持屏幕常亮；无渲染产出
 * 独立成组件而非页面内 hook：配置订阅的重渲染只落在这里，不惊动整页
 * 走 useFocusEffect 而非 useIsFocused：聚焦态变化不触发重渲染，且被其他页覆盖时也会释放
 * 无需处理切后台——常亮在 Android 是窗口标志、iOS 只对前台生效
 */
export function KeepScreenAwake(): null {
    const enabled = useConfig('basic.musicDetailAwake');

    useFocusEffect(
        useCallback(() => {
            if (!enabled) {
                return;
            }
            acquireKeepAwake(KEEP_AWAKE_TAG);
            return () => releaseKeepAwake(KEEP_AWAKE_TAG);
        }, [enabled]),
    );

    return null;
}
