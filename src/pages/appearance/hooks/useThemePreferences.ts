import { useSyncExternalStore } from 'react';

import { theme } from '@/core/theme';

import type { ThemePreferences } from '@/core/theme';

function subscribe(onChange: () => void): () => void {
    return theme.subscribe(onChange);
}

function getSnapshot(): ThemePreferences {
    return theme.getPreferences();
}

/** 订阅完整主题偏好；core 每次提交都产出新的冻结快照，引用相等即可驱动重渲染 */
function useThemePreferences(): ThemePreferences {
    return useSyncExternalStore(subscribe, getSnapshot);
}

export { useThemePreferences };
