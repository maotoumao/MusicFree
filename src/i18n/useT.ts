import { useAtomValue } from 'jotai';

import { localeAtom } from './store';
import { t } from './translate';

/** 订阅 locale：切换语言时使用组件会重渲染，t() 取到新文案 */
export function useT(): typeof t {
    useAtomValue(localeAtom);
    return t;
}
