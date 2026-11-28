import { atom } from 'jotai';

import { atomStore } from '@/utils/atomStore';

import enUS from './locales/en-US.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';

import type { Locale, Translations } from './types';

export const SUPPORTED_LOCALES: readonly Locale[] = ['zh-CN', 'zh-TW', 'en-US'];

/** 各语言的自称：语言选择器直接展示，不随当前语言翻译 */
export const LOCALE_NAMES: Record<Locale, string> = {
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
    'en-US': 'English',
};

// 各 locale 结构须对齐源语言 zh-CN（缺 key 在此编译报错）
const TRANSLATIONS: Record<Locale, Translations> = {
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    'en-US': enUS,
};

/**
 * 当前语言：默认 zh-CN（无 Provider，用默认 store）
 * 用户选择的持久化归 core/config（boot 读 → setLocale）
 */
export const localeAtom = atom<Locale>('zh-CN');

export function setLocale(locale: Locale): void {
    atomStore.set(localeAtom, locale);
}

/** 当前语言；供非 React 场景读（如语言选择器标记当前项） */
export function getLocale(): Locale {
    return atomStore.get(localeAtom);
}

/** 当前语言 + 源语言（缺失回退）两张翻译表 */
export function getActiveTranslations(): {
    current: Translations;
    source: Translations;
} {
    return { current: TRANSLATIONS[atomStore.get(localeAtom)], source: zhCN };
}
