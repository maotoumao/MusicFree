import { toCompactCountCJK, toCompactCountLatin } from '@/utils/number';

import { getLocale } from './store';
import { t } from './translate';

/**
 * 大数值的紧凑本地化：中文按万 / 亿，英文按 K / M
 * 分档是纯计算（utils/number），单位文案与拼接方式由 locale 决定，故组装放在 i18n 层
 * 档位与语言强绑定：中文只会命中万 / 亿、英文只会命中 K / M
 * locale 文件里另一套档位的文案仅为 key 结构完备而存在，运行时取不到
 * 读屏应另读完整数字，不要用本函数的结果
 */
export function formatCount(count: number): string {
    const locale = getLocale();
    const compact =
        locale === 'en-US'
            ? toCompactCountLatin(count)
            : toCompactCountCJK(count);
    if (compact.magnitude === 'none') {
        return String(compact.value);
    }
    return t(`common.countUnit.${compact.magnitude}`, {
        value: compact.value,
    });
}
