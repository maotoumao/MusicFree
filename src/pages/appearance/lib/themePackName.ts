import { BUILTIN_DARK_PACK_ID, BUILTIN_LIGHT_PACK_ID } from '@/core/theme';

import type { ThemePack } from '@/core/theme';
import type { t } from '@/i18n';

/** 主题显示名：内置主题的名字来自 i18n（core 不持文案），用户主题用自己的命名 */
function themePackName(pack: ThemePack, translate: typeof t): string {
    if (pack.id === BUILTIN_LIGHT_PACK_ID) {
        return translate('appearance.theme.builtinLight');
    }
    if (pack.id === BUILTIN_DARK_PACK_ID) {
        return translate('appearance.theme.builtinDark');
    }
    return pack.name;
}

export { themePackName };
