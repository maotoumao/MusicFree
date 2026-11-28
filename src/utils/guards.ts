/**
 * 收窄 unknown 的类型守卫与守卫组合子
 * 用于校验不可信来源的数据（持久化读回、备份文件、插件返回值等）
 */

// —— 守卫：直接判定一个值 ——

/** 普通对象：排除 null 与数组 */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 字符串，允许空串 */
export function isString(value: unknown): value is string {
    return typeof value === 'string';
}

/** 非空字符串 */
export function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

/** 有限数：排除 NaN 与 ±Infinity */
export function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/** 布尔值 */
export function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
}

// —— 组合子：按参数生成守卫 ——

/** 值是给定字面量之一（枚举成员判定；字符串与数字皆可） */
export function oneOf<T extends string | number>(
    ...allowed: readonly T[]
): (value: unknown) => value is T {
    return (value): value is T => allowed.includes(value as T);
}

/** 闭区间 [min, max] 内的有限数 */
export function numberInRange(
    min: number,
    max: number,
): (value: unknown) => value is number {
    return (value): value is number =>
        isFiniteNumber(value) && value >= min && value <= max;
}

/** 闭区间 [min, max] 内的整数（计数量用；非整数一律拒绝） */
export function integerInRange(
    min: number,
    max: number,
): (value: unknown) => value is number {
    return (value): value is number =>
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= min &&
        value <= max;
}

/**
 * 匹配给定正则的字符串
 * 内部持有正则副本并每次重置 lastIndex：带 `g` / `y` 标志的 `test` 会推进 lastIndex，
 * 直接用调用方的对象既会让同一个值反复判定的结果不一致，也会改到对方的状态
 */
export function stringMatching(
    pattern: RegExp,
): (value: unknown) => value is string {
    const owned = new RegExp(pattern.source, pattern.flags);
    return (value): value is string => {
        if (typeof value !== 'string') {
            return false;
        }
        owned.lastIndex = 0;
        return owned.test(value);
    };
}
