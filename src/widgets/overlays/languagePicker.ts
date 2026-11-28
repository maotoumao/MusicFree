/**
 * 语言选择器：底部 action sheet 列出支持的语言，勾选当前项，点选即切换并持久化
 * 语言名用各自的自称展示，不随当前语言翻译
 */
import { config } from '@/core/config';
import {
    getLocale,
    LOCALE_NAMES,
    setLocale,
    SUPPORTED_LOCALES,
    t,
} from '@/i18n';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';

import type { ActionSheetItem } from '@/widgets/overlays/ActionSheetPanel';

/** 打开语言选择器 */
export function showLanguagePicker(): void {
    const current = getLocale();
    const items: ActionSheetItem[] = SUPPORTED_LOCALES.map(locale => ({
        label: LOCALE_NAMES[locale],
        selected: locale === current,
        onPress: () => {
            // 先落库再切换：写失败时当前会话仍是旧语言，与重启后一致
            config.set('app.language', locale);
            setLocale(locale);
        },
    }));
    showActionSheetPanel({ title: t('home.drawer.language'), items });
}
