import type zhCN from './locales/zh-CN.json';

/** 源语言结构 = 所有 locale 必须对齐的形状（缺 key 编译报错） */
export type Translations = typeof zhCN;

/** 支持的语言 */
export type Locale = 'zh-CN' | 'zh-TW' | 'en-US';

/** CLDR 复数类目 */
type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * 复数节点判定：键全是 CLDR 类目 + 值全是字符串 + 含 other
 * 借「键是否全为 CLDR 类目」把复数节点与普通「全字符串命名空间」区分开
 */
type IsPluralNode<T> = T extends Record<string, string>
    ? 'other' extends keyof T
        ? keyof T extends PluralCategory
            ? true
            : false
        : false
    : false;

/** 所有可用翻译 key（点分路径：字符串叶子 + 复数叶子；不下钻复数节点） */
export type TranslationKey = KeyPaths<Translations>;
type KeyPaths<T> = {
    [K in keyof T & string]: T[K] extends string
        ? K
        : IsPluralNode<T[K]> extends true
        ? K
        : `${K}.${KeyPaths<T[K]>}`;
}[keyof T & string];

/** 复数 key（值为 CLDR 类目对象，t() 强制要 count） */
export type PluralKey = PluralPaths<Translations>;
type PluralPaths<T> = {
    [K in keyof T & string]: IsPluralNode<T[K]> extends true
        ? K
        : T[K] extends string
        ? never
        : `${K}.${PluralPaths<T[K]>}`;
}[keyof T & string];

/** 纯文本 key */
export type PlainKey = Exclude<TranslationKey, PluralKey>;
