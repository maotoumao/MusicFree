import type { ILanguage, ILanguageData } from "@/types/core/i18n";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import PersistStatus from "@/utils/persistStatus";

import zhCN from "./languages/zh-cn.json";
import enUS from "./languages/en-us.json";
import zhTW from "./languages/zh-tw.json";


const allLanguages: ILanguage[] = [{
    locale: "zh-CN",
    name: "简体中文",
    languageData: zhCN,
}, {
    locale: "zh-TW",
    name: "繁体中文",
    languageData: zhTW,
}, {
    locale: "en-US",
    name: "English",
    languageData: enUS,
}];

const defaultLocale = PersistStatus.get("app.language") || "zh-CN";
const currentLanguageAtom = atom<ILanguage>(allLanguages.find(item => item.locale === defaultLocale) ?? allLanguages[0]);


class I18N<K extends keyof ILanguageData> {
    setup() {

    }

    getSupportedLanguages() {
        return allLanguages;
    }

    getLanguage() {
        return getDefaultStore().get(currentLanguageAtom);
    }

    setLanguage(locale: string) {
        const language = allLanguages.find(item => item.locale === locale) ?? allLanguages[0];
        getDefaultStore().set(currentLanguageAtom, language);
        PersistStatus.set("app.language", language.locale);
    }

    t(key: K, args?: Record<string, any>): ILanguageData[K] {
        const language = getDefaultStore().get(currentLanguageAtom);
        if (!language) {
            return "";
        }
        const value = language.languageData[key] ?? allLanguages[0].languageData[key] ?? "";
        if (!args) {
            return value as ILanguageData[K];
        }

        return value.replace(/{(\w+)}/g, (_, argKey) => args[argKey] ?? "");
    }
}

const i18n = new I18N();
export default i18n;

export function useI18N(): I18N<keyof ILanguageData> {
    useAtomValue(currentLanguageAtom); // 用来通知组件刷新

    return i18n;
}
