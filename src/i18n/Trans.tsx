import { useAtomValue } from 'jotai';
import { Fragment, type ReactNode } from 'react';

import { localeAtom } from './store';
import { interpolate, resolveTemplate, type Params } from './translate';

import type { PlainKey } from './types';

/** 单层标签渲染函数：<tag>inner</tag> → 由调用方决定渲染成什么 */
type TagRenderers = Record<string, (children: ReactNode) => ReactNode>;

interface TransProps {
    /** 翻译 key，其文案可含 `{name}` 与单层 `<tag>…</tag>` */
    k: PlainKey;
    /** `{name}` 插值 */
    values?: Params;
    /** 标签名 → 渲染函数 */
    tags?: TagRenderers;
}

const TAG_RE = /<(\w+)>([\s\S]*?)<\/\1>/g;

/**
 * 富文本翻译：解析 `{name}` 插值 + 单层 `<tag>…</tag>`，标签内容交给 `tags` 渲染
 * 仅支持单层标签；纯文本用 `t()`
 */
export function Trans({ k, values, tags }: TransProps): ReactNode {
    // 订阅 locale：切换语言时本组件重渲染，取到新文案
    useAtomValue(localeAtom);
    const template = resolveTemplate(k);
    const out: ReactNode[] = [];
    let last = 0;
    let seq = 0;
    TAG_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TAG_RE.exec(template)) !== null) {
        if (match.index > last) {
            out.push(interpolate(template.slice(last, match.index), values));
        }
        const tagName = match[1] ?? '';
        const inner = interpolate(match[2] ?? '', values);
        const render = tags?.[tagName];
        out.push(
            <Fragment key={seq++}>{render ? render(inner) : inner}</Fragment>,
        );
        last = match.index + match[0].length;
    }
    if (last < template.length) {
        out.push(interpolate(template.slice(last), values));
    }
    return <>{out}</>;
}
