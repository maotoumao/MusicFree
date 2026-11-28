import { getActiveTranslations } from './store';

import type { PlainKey, PluralKey, Translations } from './types';

/** 插值参数（`{name}` 占位对应的值） */
export type Params = Record<string, string | number>;

/** 复数节点：CLDR 类目 → 文案 */
type PluralNode = Record<string, string>;
type TransNode = string | PluralNode;

/** 按点分路径在一张翻译表里取节点 */
function resolveIn(root: Translations, key: string): TransNode | undefined {
    let node: unknown = root;
    for (const seg of key.split('.')) {
        if (typeof node !== 'object' || node === null) {
            return undefined;
        }
        node = (node as Record<string, unknown>)[seg];
    }
    if (typeof node === 'string') {
        return node;
    }
    if (typeof node === 'object' && node !== null) {
        return node as PluralNode;
    }
    return undefined;
}

/** 当前 locale 取不到时回退源语言 */
function resolve(key: string): TransNode | undefined {
    const { current, source } = getActiveTranslations();
    return resolveIn(current, key) ?? resolveIn(source, key);
}

/** 二元复数选择（设备端 Hermes 无 Intl.PluralRules；二元对 zh/en 正确） */
function selectPlural(node: PluralNode, count: number): string {
    const category = count === 1 ? 'one' : 'other';
    return node[category] ?? node.other ?? '';
}

/** `{name}` 插值；缺参数保留原样占位 */
export function interpolate(template: string, params?: Params): string {
    if (!params) {
        return template;
    }
    return template.replace(/\{(\w+)\}/g, (_, name: string) => {
        const value = params[name];
        return value === undefined ? `{${name}}` : String(value);
    });
}

/** 取 key 的原始模板串（供 <Trans> 分词；富文本 key 也是字符串节点） */
export function resolveTemplate(key: string): string {
    const node = resolve(key);
    return typeof node === 'string' ? node : key;
}

type PluralParams = { count: number } & Params;

export function t(key: PlainKey, params?: Params): string;
export function t(key: PluralKey, params: PluralParams): string;
export function t(key: string, params?: Params): string {
    const node = resolve(key);
    if (node === undefined) {
        return key;
    }
    if (typeof node === 'string') {
        return interpolate(node, params);
    }
    const count = typeof params?.count === 'number' ? params.count : 0;
    return interpolate(selectPlural(node, count), params);
}
