import { findActiveLine, parseLyric } from './parser';

/** 取 [00:0x.00]a/b/c 三行样例的解析结果，时间为 1/3/5 秒 */
function sampleLines() {
    return parseLyric('[00:01.00]a\n[00:03.00]b\n[00:05.00]c').lines;
}

describe('parseLyric — 基本解析', () => {
    it('解析带时间戳的行并按时间升序重排下标', () => {
        const { lines } = parseLyric('[00:01.00]a\n[00:03.50]b');
        expect(lines).toEqual([
            { time: 1, text: 'a', index: 0 },
            { time: 3.5, text: 'b', index: 1 },
        ]);
    });

    it('乱序输入按时间排序', () => {
        const { lines } = parseLyric('[00:03.00]late\n[00:01.00]early');
        expect(lines.map(l => l.text)).toEqual(['early', 'late']);
        expect(lines.map(l => l.index)).toEqual([0, 1]);
    });

    it('支持 hh:mm:ss.xx 时间戳', () => {
        const { lines } = parseLyric('[01:02:03.45]x');
        expect(lines[0]?.time).toBeCloseTo(3723.45, 5);
    });

    it('一行多时间戳展开成多行同文本', () => {
        const { lines } = parseLyric('[00:01.00][00:05.00]同一句');
        expect(lines).toEqual([
            { time: 1, text: '同一句', index: 0 },
            { time: 5, text: '同一句', index: 1 },
        ]);
    });
});

describe('parseLyric — 元信息', () => {
    it('保留 ti/ar 标签，offset 由毫秒换算为秒', () => {
        const { meta } = parseLyric(
            '[ti:歌名]\n[ar:歌手]\n[offset:500]\n[00:01.00]a',
        );
        expect(meta.ti).toBe('歌名');
        expect(meta.ar).toBe('歌手');
        expect(meta.offset).toBe(0.5);
    });

    it('同一行的元标签与时间标签都被正确处理、正文不残留标签', () => {
        const { lines, meta } = parseLyric('[ti:Song][00:01.00]hello');
        expect(meta.ti).toBe('Song');
        expect(lines).toEqual([{ time: 1, text: 'hello', index: 0 }]);
    });

    it('非法 offset 不产生 NaN', () => {
        const { meta } = parseLyric('[offset:乱码]\n[00:01.00]a');
        expect(meta.offset).toBeUndefined();
    });

    it('无元信息时 meta 为空', () => {
        expect(parseLyric('[00:01.00]a').meta).toEqual({});
    });
});

describe('parseLyric — 降级与边界', () => {
    it('无任何时间戳时按行降级为纯文本（time 为 0）', () => {
        const { lines } = parseLyric('第一行\n第二行');
        expect(lines).toEqual([
            { time: 0, text: '第一行', index: 0 },
            { time: 0, text: '第二行', index: 1 },
        ]);
    });

    it('纯元信息输入不产生歌词行', () => {
        const { lines, meta } = parseLyric('[ti:X]\n[ar:Y]');
        expect(lines).toEqual([]);
        expect(meta.ti).toBe('X');
        expect(meta.ar).toBe('Y');
    });

    it('空字符串得到空歌词与空元信息', () => {
        expect(parseLyric('')).toEqual({
            lines: [],
            meta: {},
            timed: false,
            sourceLines: 0,
        });
    });

    it('只给翻译、没有正文时用翻译当正文', () => {
        const { lines } = parseLyric('', { translation: '[00:01.00]trans' });
        expect(lines[0]?.text).toBe('trans');
        expect(lines[0]?.translation).toBeUndefined();
    });

    it('正文只有元信息、有翻译时用翻译当正文', () => {
        const { lines } = parseLyric('[ti:X]', {
            translation: '[00:01.00]trans',
        });
        expect(lines[0]?.text).toBe('trans');
    });

    it('兼容 CRLF 换行', () => {
        const { lines } = parseLyric('[00:01.00]a\r\n[00:02.00]b');
        expect(lines.map(l => l.text)).toEqual(['a', 'b']);
    });
});

describe('parseLyric — 翻译合并', () => {
    it('两轨都有时间轴时按时间精确匹配', () => {
        const { lines } = parseLyric('[00:01.00]hello\n[00:02.00]world', {
            translation: '[00:01.00]你好\n[00:02.00]世界',
        });
        expect(lines[0]?.translation).toBe('你好');
        expect(lines[1]?.translation).toBe('世界');
    });

    it('时间不匹配的行不设 translation', () => {
        const { lines } = parseLyric('[00:01.00]a\n[00:02.00]b', {
            translation: '[00:01.00]甲',
        });
        expect(lines[0]?.translation).toBe('甲');
        expect(lines[1]?.translation).toBeUndefined();
    });

    it('两轨都无时间轴时按行号逐行配', () => {
        const { lines } = parseLyric('a\nb', { translation: '甲\n乙' });
        expect(lines[0]?.translation).toBe('甲');
        expect(lines[1]?.translation).toBe('乙');
    });

    it('正文有时间轴、译文是纯文本时也按行号配（抄来的译文多半没有时间戳）', () => {
        const { lines } = parseLyric('[00:01.00]a\n[00:02.00]b', {
            translation: '甲\n乙',
        });
        expect(lines[0]?.translation).toBe('甲');
        expect(lines[1]?.translation).toBe('乙');
    });

    it('按行号配时行数不一致只配到短的那头，多出来的行无译文', () => {
        const { lines } = parseLyric('a\nb\nc', { translation: '甲\n乙' });
        expect(lines.map(line => line.translation)).toEqual([
            '甲',
            '乙',
            undefined,
        ]);
    });

    it('按行号配时跳过空行，对的是非空行的序号', () => {
        const { lines } = parseLyric('a\n\nb', {
            translation: '甲\n\n\n乙',
        });
        expect(lines[0]?.translation).toBe('甲');
        expect(lines[1]?.translation).toBe('乙');
    });

    it('按行号配时，一行多时间戳展开出的多条播放行共用同一句译文', () => {
        // 展开成 A@1 / A@5 / B@10 三条播放行，但原文只有两句，译文也只有两句
        const { lines } = parseLyric('[00:01.00]A\n[00:10.00]B', {
            translation: '甲\n乙',
        });
        expect(lines.map(line => line.translation)).toEqual(['甲', '乙']);

        const repeated = parseLyric('[00:01.00][00:05.00]A\n[00:10.00]B', {
            translation: '甲\n乙',
        }).lines;
        expect(repeated.map(line => [line.text, line.translation])).toEqual([
            ['A', '甲'],
            ['A', '甲'],
            ['B', '乙'],
        ]);
    });

    it('按行号配不受时间戳乱序影响：配对看原文行号，不看播放顺序', () => {
        const { lines } = parseLyric('[00:10.00]late\n[00:01.00]early', {
            translation: '晚\n早',
        });
        // 播放顺序按时间排过，但每行拿到的仍是它在原文里对应的那句
        expect(lines.map(line => [line.text, line.translation])).toEqual([
            ['early', '早'],
            ['late', '晚'],
        ]);
    });

    it('只有时间戳、正文为空的行不占译文位', () => {
        const { lines } = parseLyric('[00:01.00]\n[00:05.00]A\n[00:10.00]B', {
            translation: '甲\n乙',
        });
        expect(lines.map(line => [line.text, line.translation])).toEqual([
            ['', undefined],
            ['A', '甲'],
            ['B', '乙'],
        ]);
    });

    it('sourceLines 是原文非空正文行数，不含多时间戳的展开', () => {
        const result = parseLyric('[00:01.00][00:05.00]A\n[00:10.00]B');
        expect(result.lines).toHaveLength(3);
        expect(result.sourceLines).toBe(2);
    });
});

describe('parseLyric — 歌词格式兼容', () => {
    it.each(['\n', '\r\n', '\r'])(
        '兼容换行 %j，正文、译文与元信息使用相同规则',
        newline => {
            const result = parseLyric(
                ['[ti:Song]', '[00:01.00]a', '[00:02.00]b'].join(newline),
                {
                    translation: ['[00:01.00]甲', '[00:02.00]乙'].join(newline),
                },
            );
            expect(result.lines).toEqual([
                { time: 1, text: 'a', translation: '甲', index: 0 },
                { time: 2, text: 'b', translation: '乙', index: 1 },
            ]);
            expect(result.meta.ti).toBe('Song');
            expect(result.sourceLines).toBe(2);
        },
    );

    it('混合换行不残留时间戳或多出空播放行', () => {
        const result = parseLyric('[00:01]a\r[00:02]b\r\n[00:03]c\n[00:04]d');
        expect(result.lines.map(line => [line.time, line.text])).toEqual([
            [1, 'a'],
            [2, 'b'],
            [3, 'c'],
            [4, 'd'],
        ]);
    });

    it('标签间空白不拆散多时间戳，同一句仍只占一个译文位置', () => {
        const result = parseLyric(
            '[ti:Song] \t[offset:500] [00:01] \t[00:05] A\n[00:10]B',
            { translation: '甲\n乙' },
        );
        expect(result.lines).toEqual([
            { time: 1, text: 'A', translation: '甲', index: 0 },
            { time: 5, text: 'A', translation: '甲', index: 1 },
            { time: 10, text: 'B', translation: '乙', index: 2 },
        ]);
        expect(result.meta).toEqual({ ti: 'Song', offset: 0.5 });
        expect(result.sourceLines).toBe(2);
    });

    it('时间戳单独一行时关联后续正文，不再显示空歌词', () => {
        const result = parseLyric('[00:01]\nA\n[00:05]\nB', {
            translation: '甲\n乙',
        });
        expect(result.lines).toEqual([
            { time: 1, text: 'A', translation: '甲', index: 0 },
            { time: 5, text: 'B', translation: '乙', index: 1 },
        ]);
        expect(result.sourceLines).toBe(2);
    });

    it('同一句跨行正文保留换行，多时间戳展开共享它与译文', () => {
        const result = parseLyric('[00:01] [00:05]\nA\n续句\n[00:10]B', {
            translation: '甲\n乙',
        });
        expect(result.lines.map(line => [line.text, line.translation])).toEqual(
            [
                ['A\n续句', '甲'],
                ['A\n续句', '甲'],
                ['B', '乙'],
            ],
        );
        expect(result.sourceLines).toBe(2);
    });

    it('遇到下一行时间戳就结束前一句，保留真正的空白时间点', () => {
        const result = parseLyric('[00:01]\n[00:05]\nA\n[00:10]', {
            translation: '甲',
        });
        expect(result.lines).toEqual([
            { time: 1, text: '', index: 0 },
            { time: 5, text: 'A', translation: '甲', index: 1 },
            { time: 10, text: '', index: 2 },
        ]);
        expect(result.sourceLines).toBe(1);
    });

    it('正文后的时间戳开启下一句，末尾时间戳保留为空白行', () => {
        const result = parseLyric('[00:01]A [00:05]B[00:10]', {
            translation: '甲\n乙',
        });
        expect(result.lines).toEqual([
            { time: 1, text: 'A', translation: '甲', index: 0 },
            { time: 5, text: 'B', translation: '乙', index: 1 },
            { time: 10, text: '', index: 2 },
        ]);
        expect(result.sourceLines).toBe(2);
        expect(findActiveLine(result.lines, 10).line?.text).toBe('');
    });

    it('正文中后续连续时间戳仍对应同一句，排序后译文不串位', () => {
        const result = parseLyric('[00:10]B[00:01] [00:05]A', {
            translation: '乙\n甲',
        });
        expect(result.lines).toEqual([
            { time: 1, text: 'A', translation: '甲', index: 0 },
            { time: 5, text: 'A', translation: '甲', index: 1 },
            { time: 10, text: 'B', translation: '乙', index: 2 },
        ]);
        expect(result.sourceLines).toBe(2);
    });

    it('译文也支持分行与正文后的时间戳，并按时间而非位置合并', () => {
        const result = parseLyric('[00:01]A[00:05]B', {
            translation: '[00:05]\n乙[00:01]\n甲',
        });
        expect(result.lines.map(line => [line.text, line.translation])).toEqual(
            [
                ['A', '甲'],
                ['B', '乙'],
            ],
        );
    });

    it('只有翻译时，也能用兼容格式作为正文', () => {
        const result = parseLyric('', { translation: '[00:01]\r甲[00:05]乙' });
        expect(result.lines).toEqual([
            { time: 1, text: '甲', index: 0 },
            { time: 5, text: '乙', index: 1 },
        ]);
        expect(result.timed).toBe(true);
    });

    it('纯文本的单独 CR 换行仍按非空行呈现和匹配译文', () => {
        const result = parseLyric('A\r\rB', { translation: '甲\r乙' });
        expect(result.lines).toEqual([
            { time: 0, text: 'A', translation: '甲', index: 0 },
            { time: 0, text: 'B', translation: '乙', index: 1 },
        ]);
        expect(result.timed).toBe(false);
        expect(result.sourceLines).toBe(2);
    });

    it('正文中的普通方括号和畸形时间标签不被清除', () => {
        const body = 'A [chorus] [note:value] [00:xx] [1:2:3:4]';
        const result = parseLyric(`[00:01]${body}[00:05]B`);
        expect(result.lines.map(line => line.text)).toEqual([body, 'B']);
        expect(result.meta).toEqual({});
    });

    it.each(['[chorus]', '[00:xx]', '[1:2:3:4]', 'plain '])(
        '未进入时间轴时，前缀 %s 后的时间标签仍属于纯文本',
        prefix => {
            const raw = `${prefix}[00:01]A`;
            const result = parseLyric(raw, { translation: '甲' });
            expect(result.lines).toEqual([
                { time: 0, text: raw, translation: '甲', index: 0 },
            ]);
            expect(result.timed).toBe(false);
            expect(result.sourceLines).toBe(1);
        },
    );

    it('承接上一行时间戳时保留普通前缀，并能在后续时间戳处分句', () => {
        const result = parseLyric('[00:01]A\n[chorus] B [00:05]C', {
            translation: '甲\n乙',
        });
        expect(result.lines).toEqual([
            { time: 1, text: 'A\n[chorus] B', translation: '甲', index: 0 },
            { time: 5, text: 'C', translation: '乙', index: 1 },
        ]);
        expect(result.sourceLines).toBe(2);
    });

    it('非有限时间标签保留为正文，不生成无效播放时间', () => {
        const invalid = `[${'9'.repeat(400)}:01]`;
        const result = parseLyric(`[00:01]A ${invalid}[00:05]B`);
        expect(result.lines.map(line => [line.time, line.text])).toEqual([
            [1, `A ${invalid}`],
            [5, 'B'],
        ]);
    });
});

describe('parseLyric — 标签边界', () => {
    it('正文中的普通方括号原样保留', () => {
        const { lines } = parseLyric('[00:01.00]I [love] you');
        expect(lines[0]?.text).toBe('I [love] you');
    });

    it('行首畸形标签当作正文，不误判为时间或元信息', () => {
        const { lines, meta } = parseLyric('[00:xx]hello');
        expect(meta['00']).toBeUndefined();
        expect(lines[0]).toEqual({ time: 0, text: '[00:xx]hello', index: 0 });
    });

    it('超过 3 段的时间标签当作正文', () => {
        const { lines } = parseLyric('[1:2:3:4]x');
        expect(lines[0]).toEqual({ time: 0, text: '[1:2:3:4]x', index: 0 });
    });

    it('[offset:] 空值不设 offset', () => {
        expect(
            parseLyric('[offset:]\n[00:01.00]a').meta.offset,
        ).toBeUndefined();
    });
});

describe('findActiveLine', () => {
    it('空歌词返回 -1', () => {
        expect(findActiveLine([], 2)).toEqual({ index: -1, line: null });
    });

    it('首行之前返回 -1', () => {
        expect(findActiveLine(sampleLines(), 0.5)).toEqual({
            index: -1,
            line: null,
        });
    });

    it('非有限时间返回 -1（有无 hint 结果一致）', () => {
        expect(findActiveLine(sampleLines(), NaN)).toEqual({
            index: -1,
            line: null,
        });
        expect(findActiveLine(sampleLines(), NaN, 2)).toEqual({
            index: -1,
            line: null,
        });
    });

    it('区间内命中对应行', () => {
        const result = findActiveLine(sampleLines(), 2);
        expect(result.index).toBe(0);
        expect(result.line?.text).toBe('a');
    });

    it('时间戳边界处命中该行', () => {
        expect(findActiveLine(sampleLines(), 3).index).toBe(1);
    });

    it('末行之后钳制到末行', () => {
        expect(findActiveLine(sampleLines(), 99).index).toBe(2);
    });

    it('hint 命中当前行时直接返回', () => {
        expect(findActiveLine(sampleLines(), 2, 0).index).toBe(0);
    });

    it('hint 推进到下一行', () => {
        expect(findActiveLine(sampleLines(), 4, 0).index).toBe(1);
    });

    it('hint 过时（seek 回退）时退回二分', () => {
        expect(findActiveLine(sampleLines(), 2, 2).index).toBe(0);
    });

    it('hint 为 -1 或越界都安全退回二分', () => {
        expect(findActiveLine(sampleLines(), 4, -1).index).toBe(1);
        expect(findActiveLine(sampleLines(), 4, 99).index).toBe(1);
    });
});
