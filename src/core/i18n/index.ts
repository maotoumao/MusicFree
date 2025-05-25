import type { ILanguage, ILanguageData } from "@/types/core/i18n";
import { atom, getDefaultStore, useAtomValue } from "jotai";

import zhCN from "./languages/zh-cn.json";
import enUS from "./languages/en-us.json";


const allLanguages: ILanguage[] = [{
    locale: 'zh-CN',
    name: '简体中文',
    languageData: zhCN,
}, {
    locale: 'zh-TW',
    name: '繁体中文',
    languageData: {} as ILanguageData,
},{
    locale: "en-US",
    name: "English",
    languageData: enUS
}];

const currentLanguageAtom = atom<ILanguage>(allLanguages[0]);


class I18N<K extends keyof ILanguageData> {
    setup() {

    }

    supportedLanguages() {
        return allLanguages;
    }

    getLanguage() {
        return getDefaultStore().get(currentLanguageAtom);
    }

    setLanguage(locale: string) {
        const language = allLanguages.find(item => item.locale === locale) ?? allLanguages[0];
        getDefaultStore().set(currentLanguageAtom, language);
    }

    t(key: K): ILanguageData[K] | null {
        const language = getDefaultStore().get(currentLanguageAtom);
        if (!language) {
            return null;
        }
        const value = language.languageData[key];

        return value ?? null;
    }
}

const i18n = new I18N();
export default i18n;

export function useI18N(): ILanguage {
    const currentLanguage = useAtomValue(currentLanguageAtom);

    return currentLanguage;
}


export function useI18NData(): ILanguageData {
    const currentLanguage = useAtomValue(currentLanguageAtom);

    if (!currentLanguage) {
        return {} as ILanguageData;
    }

    return currentLanguage.languageData;
}

export function useI18NDataByKey<K extends keyof ILanguageData>(key: K): ILanguageData[K] | null {
    const currentLanguage = useAtomValue(currentLanguageAtom);

    if (!currentLanguage) {
        return null;
    }
    const value = currentLanguage.languageData[key];
    if (!value) {
        return null;
    }
    return value;
}

interface I18NViewProps {
    i18nKey: keyof ILanguageData;
    children?: (value: ILanguageData[keyof ILanguageData] | null) => React.ReactNode;
}

export function I18NView(props: I18NViewProps) {
    const { i18nKey, children } = props;

    const i18nValue = useI18NDataByKey(i18nKey);

    if (!children) {
        return null;
    }

    return children(i18nValue);
}