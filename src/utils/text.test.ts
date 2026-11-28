import {
    clampToMaxLength,
    firstNonBlank,
    minDistance,
    utf8ByteLength,
} from './text';

describe('utf8ByteLength', () => {
    it.each([
        ['ASCII 每字符 1 字节', 'abc', 3],
        ['拉丁扩展 2 字节', '\u00e9', 2],
        ['中日韩 3 字节', '中文', 6],
        ['代理对整体 4 字节', '\uD83D\uDE00', 4],
        ['混合内容', 'a中\uD83D\uDE00', 1 + 3 + 4],
        ['空串', '', 0],
    ])('%s', (_name, text, expected) => {
        expect(utf8ByteLength(text)).toBe(expected);
    });

    it('孤立代理项按 U+FFFD 的 3 字节计，且不吞掉后一个字符', () => {
        // 编码器遇到未配对的代理项会换成 U+FFFD；按码元跳读会把后面的字符一起漏算
        expect(utf8ByteLength('\uD800')).toBe(3);
        expect(utf8ByteLength('\uD800中')).toBe(6);
        expect(utf8ByteLength('\uDC00')).toBe(3);
    });

    it('与 clampToMaxLength 的截断口径一致', () => {
        expect(utf8ByteLength('ab\uD83D\uDE00')).toBe(6);
    });
});

describe('minDistance', () => {
    it('空串：距离等于另一串长度', () => {
        expect(minDistance('', '')).toBe(0);
        expect(minDistance('abc', '')).toBe(3);
        expect(minDistance('', 'ab')).toBe(2);
    });

    it('相同串距离为 0', () => {
        expect(minDistance('kitten', 'kitten')).toBe(0);
    });

    it('单次增删改距离为 1', () => {
        expect(minDistance('abc', 'abd')).toBe(1); // 替换
        expect(minDistance('abc', 'abcd')).toBe(1); // 插入
        expect(minDistance('abcd', 'abc')).toBe(1); // 删除
    });

    it('经典 Levenshtein 例子', () => {
        expect(minDistance('kitten', 'sitting')).toBe(3);
        expect(minDistance('flaw', 'lawn')).toBe(2);
    });
});

describe('firstNonBlank', () => {
    it('返回首个 trim 后非空的字符串（并 trim）', () => {
        expect(firstNonBlank('  hello  ')).toBe('hello');
        expect(firstNonBlank('', '  ', 'x')).toBe('x');
    });

    it('跳过非字符串与空白', () => {
        expect(firstNonBlank(undefined, null, 42, '  ', 'ok')).toBe('ok');
    });

    it('无有效值时返回 undefined', () => {
        expect(firstNonBlank()).toBeUndefined();
        expect(firstNonBlank('', '   ', null, 0, false)).toBeUndefined();
    });
});

describe('clampToMaxLength', () => {
    it('长度不超过上限时原样返回', () => {
        expect(clampToMaxLength('abc', 5)).toBe('abc');
        expect(clampToMaxLength('abcde', 5)).toBe('abcde');
    });

    it('超过上限按码元截断', () => {
        expect(clampToMaxLength('abcdef', 4)).toBe('abcd');
    });

    it('上限恰落在代理对中间时整字符回退', () => {
        // '😀' 占 2 码元；'ab😀' 长度 4，上限 3 落在代理对中间 → 回退整个 emoji
        expect(clampToMaxLength('ab😀', 3)).toBe('ab');
    });

    it('上限恰在完整代理对之后不回退', () => {
        // 'a😀b' 长度 4，上限 3 落在完整 emoji 之后 → 保留 'a😀'
        expect(clampToMaxLength('a😀b', 3)).toBe('a😀');
        // 上限等于长度 → 完整保留
        expect(clampToMaxLength('ab😀', 4)).toBe('ab😀');
    });
});
