import {
    integerInRange,
    isBoolean,
    isFiniteNumber,
    isNonEmptyString,
    isRecord,
    numberInRange,
    oneOf,
    stringMatching,
} from './guards';

describe('守卫', () => {
    it('isRecord：普通对象通过，null / 数组 / 原始值不通过', () => {
        expect(isRecord({})).toBe(true);
        expect(isRecord({ a: 1 })).toBe(true);
        expect(isRecord(null)).toBe(false);
        expect(isRecord([])).toBe(false);
        expect(isRecord('x')).toBe(false);
    });

    it('isNonEmptyString：空串不通过', () => {
        expect(isNonEmptyString('a')).toBe(true);
        expect(isNonEmptyString('')).toBe(false);
        expect(isNonEmptyString(1)).toBe(false);
    });

    it('isFiniteNumber：排除 NaN 与 ±Infinity', () => {
        expect(isFiniteNumber(0)).toBe(true);
        expect(isFiniteNumber(-1.5)).toBe(true);
        expect(isFiniteNumber(Number.NaN)).toBe(false);
        expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
        expect(isFiniteNumber('1')).toBe(false);
    });

    it('isBoolean：只认真正的布尔值', () => {
        expect(isBoolean(false)).toBe(true);
        expect(isBoolean(true)).toBe(true);
        expect(isBoolean(0)).toBe(false);
        expect(isBoolean('true')).toBe(false);
        expect(isBoolean(null)).toBe(false);
    });
});

describe('组合子', () => {
    it('oneOf：字符串枚举', () => {
        // satisfies 锁住字面量推断：若将来签名被拓宽成 `value is string`，此处编译即失败
        const isOrder = oneOf('asc', 'desc') satisfies (
            value: unknown,
        ) => value is 'asc' | 'desc';
        expect(isOrder('asc')).toBe(true);
        expect(isOrder('desc')).toBe(true);
        expect(isOrder('sideways')).toBe(false);
        expect(isOrder(0)).toBe(false);
        expect(isOrder(undefined)).toBe(false);
    });

    it('oneOf：数字枚举（不把字符串当同值）', () => {
        const isMaxLines = oneOf(1, 2, 3, 4) satisfies (
            value: unknown,
        ) => value is 1 | 2 | 3 | 4;
        expect(isMaxLines(2)).toBe(true);
        expect(isMaxLines(5)).toBe(false);
        expect(isMaxLines('2')).toBe(false);
    });

    it('numberInRange：闭区间，端点通过', () => {
        const isOpacity = numberInRange(0, 0.9);
        expect(isOpacity(0)).toBe(true);
        expect(isOpacity(0.9)).toBe(true);
        expect(isOpacity(0.45)).toBe(true);
        expect(isOpacity(-0.1)).toBe(false);
        expect(isOpacity(0.91)).toBe(false);
        expect(isOpacity(Number.NaN)).toBe(false);
        expect(isOpacity('0.5')).toBe(false);
    });

    it('integerInRange：闭区间内的非整数也拒绝', () => {
        const isMaxDownload = integerInRange(1, 5);
        expect(isMaxDownload(1)).toBe(true);
        expect(isMaxDownload(5)).toBe(true);
        expect(isMaxDownload(2.5)).toBe(false);
        expect(isMaxDownload(0)).toBe(false);
        expect(isMaxDownload(6)).toBe(false);
        expect(isMaxDownload(Number.POSITIVE_INFINITY)).toBe(false);
    });

    it('stringMatching：匹配才通过，非字符串直接拒绝', () => {
        const isHexColor = stringMatching(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
        expect(isHexColor('#FFFFFF')).toBe(true);
        expect(isHexColor('#ffffff80')).toBe(true);
        expect(isHexColor('#FFF')).toBe(false);
        expect(isHexColor('white')).toBe(false);
        expect(isHexColor(0xffffff)).toBe(false);
    });

    it('stringMatching：同一个值反复判定结果稳定', () => {
        const isHexColor = stringMatching(/^#[0-9a-f]{6}$/i);
        expect(isHexColor('#abcdef')).toBe(true);
        expect(isHexColor('#abcdef')).toBe(true);
        expect(isHexColor('#abcdef')).toBe(true);
    });

    it('stringMatching：带 g / y 标志也稳定，且不污染调用方正则', () => {
        const global = /a/g;
        const isA = stringMatching(global);
        expect([isA('a'), isA('a'), isA('a')]).toEqual([true, true, true]);

        const sticky = /a/y;
        const isSticky = stringMatching(sticky);
        expect([isSticky('a'), isSticky('a')]).toEqual([true, true]);

        // 调用方自己的正则状态未被改动
        expect(global.lastIndex).toBe(0);
        expect(sticky.lastIndex).toBe(0);
    });
});
