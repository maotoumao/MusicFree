/**
 * 歌词解析：文本 → 结构化歌词行 + 元信息，以及按播放位置定位当前行
 * 纯计算、无内部状态；当前行的加速提示由调用方持有并回传（见 findActiveLine 的 hintIndex）
 */
import type {
    ActiveLine,
    LyricMeta,
    ParseLyricOptions,
    ParseLyricResult,
} from './types';
import type { LyricLine, ParsedLyric } from '@/types';

/** 时间标签 [mm:ss.xx] / [hh:mm:ss.xx]（限 2~3 段，用于给单个标签分类） */
const TIME_TAG = /^\[\d+:\d+(?::\d+)?(?:\.\d+)?\]$/;
/** 行分隔：兼容 CRLF / LF / CR */
const LINE_BREAK = /\r\n?|\n/;

/** decodeLyric 的内部结果，额外带 timed 标记供翻译合并选择策略 */
interface DecodedLyric {
    lines: LyricLine[];
    /**
     * 与 lines 一一对应的**逻辑行号**：一行多时间戳展开出的多条播放行共享同一个号，
     * 只有时间戳、正文为空的行记 -1（不占号）。按行号合并译文时用它，而不是数组下标——
     * 下标是展开并按时间排序之后的播放序，跟原文的第几行早就不是一回事了
     */
    ordinals: number[];
    meta: LyricMeta;
    timed: boolean;
    /** 原文里的非空正文行数（不含展开）；供「行数是否一致」这类面向用户的计数 */
    sourceLines: number;
}

/**
 * 解析歌词文本
 * - 支持一行多时间戳、按时间升序排序并重排下标
 * - 标签间允许空白，正文可另起一行；正文后的时间戳开启下一句
 * - 无任何时间戳时降级为纯文本（每行 time 为 0）
 * - 纯元信息（无正文）不产生歌词行
 * - 正文无歌词行、但有翻译时，用翻译当正文
 */
export function parseLyric(
    raw: string,
    opts?: ParseLyricOptions,
): ParseLyricResult {
    const main = (raw ?? '').trim();
    const translation = opts?.translation?.trim();

    const decoded = decodeLyric(main);

    if (decoded.lines.length === 0 && translation) {
        const fromTranslation = decodeLyric(translation);
        return {
            lines: fromTranslation.lines,
            meta: { ...fromTranslation.meta, ...decoded.meta },
            timed: fromTranslation.timed,
            sourceLines: fromTranslation.sourceLines,
        };
    }

    if (translation) {
        mergeTranslation(decoded, decodeLyric(translation));
    }

    return {
        lines: decoded.lines,
        meta: decoded.meta,
        timed: decoded.timed,
        sourceLines: decoded.sourceLines,
    };
}

/**
 * 定位 timeSec 时刻应高亮的歌词行（最后一个 time <= timeSec 的行）
 * 歌词随播放线性推进，故优先探测调用方回传的 hintIndex 及其下一行（O(1)），未命中再二分
 * @param hintIndex 上一次的当前行下标；传 -1 或越界都会安全退回二分
 */
export function findActiveLine(
    lines: ParsedLyric,
    timeSec: number,
    hintIndex?: number,
): ActiveLine {
    const len = lines.length;
    const first = lines[0];
    if (
        first === undefined ||
        !Number.isFinite(timeSec) ||
        timeSec < first.time
    ) {
        return { index: -1, line: null };
    }

    if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < len) {
        if (isActiveAt(lines, hintIndex, timeSec)) {
            return { index: hintIndex, line: lines[hintIndex] ?? null };
        }
        const next = hintIndex + 1;
        if (next < len && isActiveAt(lines, next, timeSec)) {
            return { index: next, line: lines[next] ?? null };
        }
    }

    // 二分：最后一个 time <= timeSec 的行
    let lo = 0;
    let hi = len - 1;
    let ans = 0;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const line = lines[mid];
        if (line !== undefined && line.time <= timeSec) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return { index: ans, line: lines[ans] ?? null };
}

/** 第 i 行在 timeSec 是否为当前行：time[i] <= timeSec < time[i+1]（末行无上界） */
function isActiveAt(lines: ParsedLyric, i: number, timeSec: number): boolean {
    const line = lines[i];
    if (line === undefined || line.time > timeSec) {
        return false;
    }
    const nextLine = lines[i + 1];
    return nextLine === undefined || timeSec < nextLine.time;
}

/** 解析单条歌词文本（不含翻译合并）：分出带时间戳的行 / 纯文本行 / 头部元信息 */
function decodeLyric(raw: string): DecodedLyric {
    const meta: LyricMeta = {};
    const timedLines: { line: LyricLine; ordinal: number }[] = [];
    const plainTexts: string[] = [];
    // 逻辑行号：只有非空正文才占号，展开出的多条播放行共用一个
    let ordinal = 0;
    let pendingTimes: number[] = [];
    let pendingTexts: string[] = [];

    // 遇到下一组时间戳或文件结束才提交，承接另起一行的正文。
    const flushTimed = () => {
        if (pendingTimes.length === 0) {
            return;
        }
        const text = pendingTexts.join('\n');
        const current = text.length > 0 ? ordinal++ : -1;
        for (const time of pendingTimes) {
            timedLines.push({ line: { time, text }, ordinal: current });
        }
        pendingTimes = [];
        pendingTexts = [];
    };

    for (const rawLine of raw.split(LINE_BREAK)) {
        const groups = splitLyricLine(
            rawLine.trim(),
            meta,
            pendingTimes.length > 0,
        );
        for (const { times, text } of groups) {
            if (times.length > 0) {
                // 不把下一行的时间戳合到前一组，保留仅含时间戳的空白行。
                flushTimed();
                pendingTimes = times;
                pendingTexts = text.length > 0 ? [text] : [];
            } else if (pendingTimes.length > 0) {
                pendingTexts.push(text);
            } else {
                plainTexts.push(text);
                ordinal += 1;
            }
        }
    }
    flushTimed();

    if (timedLines.length > 0) {
        // 排序只改播放顺序，不动逻辑行号
        timedLines.sort((a, b) => a.line.time - b.line.time);
        timedLines.forEach((entry, index) => {
            entry.line.index = index;
        });
        return {
            lines: timedLines.map(entry => entry.line),
            ordinals: timedLines.map(entry => entry.ordinal),
            meta,
            timed: true,
            sourceLines: ordinal,
        };
    }
    if (plainTexts.length > 0) {
        return {
            lines: plainTexts.map((text, index) => ({ time: 0, text, index })),
            ordinals: plainTexts.map((_text, index) => index),
            meta,
            timed: false,
            sourceLines: ordinal,
        };
    }
    return { lines: [], ordinals: [], meta, timed: false, sourceLines: 0 };
}

/**
 * 按时间标签拆分一行：连续标签共用正文，正文后的时间标签另起一组。
 * 元标签只在行首读取；普通方括号和非法时间标签保留为正文。
 * continuation 表示承接上一行时间戳，此时正文可以先于本行的时间标签。
 */
function splitLyricLine(
    line: string,
    meta: LyricMeta,
    continuation: boolean,
): { times: number[]; text: string }[] {
    const groups: { times: number[]; text: string }[] = [];
    let times: number[] = [];
    let textStart = 0;
    let scan = 0;
    let leading = true;

    while (scan < line.length) {
        const begin = line.indexOf('[', scan);
        if (begin < 0) {
            break;
        }
        const end = line.indexOf(']', begin);
        if (end < 0) {
            break;
        }
        const tag = line.slice(begin, end + 1);
        const time = parseTimeTag(tag);
        if (time !== null) {
            const text = line.slice(textStart, begin).trim();
            if (text.length > 0) {
                // 尚无时间轴时不截掉普通或非法前缀，整段仍按纯文本处理。
                if (times.length === 0 && !continuation) {
                    break;
                }
                groups.push({ times, text });
                times = [];
                leading = false;
            }
            times.push(time);
            textStart = end + 1;
        } else if (
            leading &&
            line.slice(textStart, begin).trim() === '' &&
            parseMetaTag(meta, tag)
        ) {
            textStart = end + 1;
        } else {
            leading = false;
        }
        scan = end + 1;
    }

    const text = line.slice(textStart).trim();
    if (times.length > 0 || text.length > 0) {
        groups.push({ times, text });
    }
    return groups;
}

/** [mm:ss.xx] / [hh:mm:ss.xx] → 秒；非合法时间标签返回 null */
function parseTimeTag(tag: string): number | null {
    if (!TIME_TAG.test(tag)) {
        return null;
    }
    // 去掉首尾方括号后按冒号分段，逐段按 60 进位（分、时）
    let seconds = 0;
    for (const part of tag.slice(1, -1).split(':')) {
        seconds = seconds * 60 + Number(part);
    }
    return Number.isFinite(seconds) ? seconds : null;
}

/** 解析单个 [key:value] 元标签写入 meta，成功返回 true；offset 毫秒→秒、空值/非有限忽略 */
function parseMetaTag(meta: LyricMeta, tag: string): boolean {
    const inner = tag.slice(1, -1);
    const colon = inner.indexOf(':');
    if (colon < 0) {
        return false;
    }
    const key = inner.slice(0, colon).trim();
    // key 必须以字母开头，排除 [00:xx] 这类畸形时间标签冒充元信息
    if (!/^[a-zA-Z]/.test(key)) {
        return false;
    }
    const value = inner.slice(colon + 1).trim();
    if (key === 'offset') {
        const ms = Number(value);
        if (value !== '' && Number.isFinite(ms)) {
            meta.offset = ms / 1000;
        }
        return true;
    }
    meta[key] = value;
    return true;
}

/**
 * 把翻译行合并进主歌词行
 *
 * 两轨都有时间轴 → 按时间戳精确匹配，行数对不上也不会串位；
 * 只要有一轨没有时间轴 → 按**逻辑行号**逐行配（网上抄来的译文多半只是纯文本行，
 * 不给它一条路等于译文根本用不了）。行号取自原文的非空正文序号，所以
 * 一行多时间戳展开出的多条播放行会拿到同一句译文，只有时间戳没正文的行也不会吃掉一句。
 * 一方多出来的行没有对应译文——是否会错位由上游（编辑器状态条）提醒，这里不做判断
 */
function mergeTranslation(main: DecodedLyric, translation: DecodedLyric): void {
    if (main.timed && translation.timed) {
        const byTime = new Map<number, string>();
        for (const line of translation.lines) {
            byTime.set(line.time, line.text);
        }
        for (const line of main.lines) {
            const translated = byTime.get(line.time);
            if (translated !== undefined) {
                line.translation = translated;
            }
        }
        return;
    }
    const byOrdinal = new Map<number, string>();
    translation.ordinals.forEach((ordinal, index) => {
        const text = translation.lines[index]?.text;
        if (ordinal >= 0 && text) {
            byOrdinal.set(ordinal, text);
        }
    });
    main.ordinals.forEach((ordinal, index) => {
        const translated = ordinal >= 0 ? byOrdinal.get(ordinal) : undefined;
        const line = main.lines[index];
        if (line && translated) {
            line.translation = translated;
        }
    });
}
