import {
    BUILTIN_THEME_PACKS,
    resolveBackgroundImageUri,
    theme,
} from '@/core/theme';
import { setThemeRuntime } from '@/design';

import type { ThemePack } from '@/core/theme';
import type { ThemePackRuntime } from '@/design';

/** 同步主题偏好到 design，并保持后续修改实时生效；文件对账在后台运行 */
function activateTheme(): void {
    const sync = () => {
        const { packs, selection } = theme.getPreferences();
        setThemeRuntime({
            packs: [...BUILTIN_THEME_PACKS, ...packs].map(toRuntimePack),
            selection,
        });
    };
    sync();
    // 订阅与 App 同寿命：主题必须一直跟着偏好走，没有需要停订的时刻
    theme.subscribe(sync);
    theme.setup().catch(() => undefined);
}

/** core 的持久形状 → design 的运行态投影：文件名在此解析为可渲染 URI */
function toRuntimePack(pack: ThemePack): ThemePackRuntime {
    const background = pack.background;
    const uri = background
        ? resolveBackgroundImageUri(background.fileName)
        : undefined;
    return {
        id: pack.id,
        scheme: pack.scheme,
        colors: pack.colors,
        background:
            background && uri
                ? {
                      uri,
                      visibility: background.visibility,
                      surfaceOpacity: background.surfaceOpacity,
                      averageColor: background.averageColor,
                  }
                : null,
        autoContrast: pack.autoContrast,
    };
}

export { activateTheme };
