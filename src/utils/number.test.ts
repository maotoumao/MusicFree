import {
    clamp,
    formatFileSize,
    toCompactCountCJK,
    toCompactCountLatin,
} from './number';

describe('formatFileSize', () => {
    it('按 1024 逐级进位', () => {
        expect(formatFileSize(512)).toBe('512 B');
        expect(formatFileSize(1024)).toBe('1.0 KB');
        expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
        expect(formatFileSize(19_293_798)).toBe('18.4 MB');
    });

    it('字节档不留小数（「1.0 B」没有意义）', () => {
        expect(formatFileSize(1)).toBe('1 B');
    });

    it('超出最大单位就封顶在 TB，不继续造单位', () => {
        expect(formatFileSize(1024 ** 6)).toMatch(/TB$/);
    });

    it('脏数据归 0：负的大小比缺失更费解', () => {
        expect(formatFileSize(0)).toBe('0 B');
        expect(formatFileSize(-1)).toBe('0 B');
        expect(formatFileSize(NaN)).toBe('0 B');
    });
});

describe('clamp', () => {
    it('区间内原样返回', () => {
        expect(clamp(3, 1, 6)).toBe(3);
    });

    it('越界夹到端点', () => {
        expect(clamp(0, 1, 6)).toBe(1);
        expect(clamp(99, 1, 6)).toBe(6);
    });

    it('端点本身包含在内', () => {
        expect(clamp(1, 1, 6)).toBe(1);
        expect(clamp(6, 1, 6)).toBe(6);
    });

    it('上限低于下限时以上限为准（空列表算出的 -1 会撞上）', () => {
        expect(clamp(5, 1, -1)).toBe(-1);
    });

    it('不替调用方处置非有限值——那是各自的策略', () => {
        expect(clamp(NaN, 1, 6)).toBeNaN();
    });
});

describe('toCompactCountCJK', () => {
    it('万以下原样返回', () => {
        expect(toCompactCountCJK(0)).toEqual({ value: 0, magnitude: 'none' });
        expect(toCompactCountCJK(9999)).toEqual({
            value: 9999,
            magnitude: 'none',
        });
    });

    it('万档 10 以下保留一位小数、10 以上取整', () => {
        expect(toCompactCountCJK(12_345)).toEqual({
            value: 1.2,
            magnitude: 'tenThousand',
        });
        expect(toCompactCountCJK(123_456)).toEqual({
            value: 12,
            magnitude: 'tenThousand',
        });
    });

    it('舍入顶到下一档时升档，不出现「10000万」', () => {
        expect(toCompactCountCJK(99_999_999)).toEqual({
            value: 1,
            magnitude: 'hundredMillion',
        });
        expect(toCompactCountCJK(100_000_000)).toEqual({
            value: 1,
            magnitude: 'hundredMillion',
        });
    });

    it('非法值归零', () => {
        expect(toCompactCountCJK(-1)).toEqual({ value: 0, magnitude: 'none' });
        expect(toCompactCountCJK(NaN)).toEqual({ value: 0, magnitude: 'none' });
    });
});

describe('toCompactCountLatin', () => {
    it('千以下原样返回', () => {
        expect(toCompactCountLatin(999)).toEqual({
            value: 999,
            magnitude: 'none',
        });
    });

    it('千档折算', () => {
        expect(toCompactCountLatin(12_345)).toEqual({
            value: 12,
            magnitude: 'thousand',
        });
    });

    it('舍入顶到下一档时升档，不出现「1000K」', () => {
        expect(toCompactCountLatin(999_999)).toEqual({
            value: 1,
            magnitude: 'million',
        });
    });
});
