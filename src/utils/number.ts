/**
 * 数值纯计算
 *
 * 大数值的紧凑分档：把原始数字拆成「显示数值 + 量级」，单位文案由调用方按 locale 提供
 * ——不含任何语言假设，中文按万/亿分档、英文按 K/M 分档，故此处只给量级不给单位
 */

/**
 * 夹到 `[min, max]` 区间内
 *
 * 不处理非有限值：`NaN` 该归下限、上限还是原样丢回去，是调用方的策略，
 * 藏在一个叫 clamp 的函数里只会让下一个调用方意外
 *
 * `max < min` 时以 `max` 为准（空列表算出 `length - 1 = -1` 就会撞上）；
 * 那种情形下两个端点都不是合法答案，调用方应先把空集单独处理掉
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/** 字节单位，由小到大；符号国际通用，不随 locale 变 */
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * 字节数转可读大小，如 `18.4 MB`
 * 非有限值与负数返回 `0 B`——它们只可能来自脏数据，显示成负的大小更费解
 */
export function formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    // 每 1024 进一档，封顶在最大单位
    const step = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        BYTE_UNITS.length - 1,
    );
    const value = bytes / 1024 ** step;
    // 字节不留小数（「1.0 B」没有意义），其余保留一位
    const text = step === 0 ? String(Math.round(value)) : value.toFixed(1);
    return `${text} ${BYTE_UNITS[step]}`;
}

/** 大数值的量级档位 */
export type CompactMagnitude =
    | 'none'
    | 'thousand'
    | 'tenThousand'
    | 'million'
    | 'hundredMillion';

export interface CompactCount {
    /** 已折算的显示数值（如 12345 → 1.2） */
    value: number;
    /** 量级；none 表示无需折算、原样显示 */
    magnitude: CompactMagnitude;
}

/** 一个量级档位：达到 unit 即可用该档折算 */
interface CompactStep {
    unit: number;
    magnitude: CompactMagnitude;
}

/** 中文档位，由小到大 */
const CJK_STEPS: readonly CompactStep[] = [
    { unit: 10_000, magnitude: 'tenThousand' },
    { unit: 100_000_000, magnitude: 'hundredMillion' },
];

/** 英文档位，由小到大 */
const LATIN_STEPS: readonly CompactStep[] = [
    { unit: 1_000, magnitude: 'thousand' },
    { unit: 1_000_000, magnitude: 'million' },
];

/** 折算并保留一位小数（10 以下留小数，10 以上取整，避免「12.0 万」这类冗余） */
function scale(count: number, unit: number): number {
    const scaled = count / unit;
    return scaled < 10 ? Math.round(scaled * 10) / 10 : Math.round(scaled);
}

function toCompact(count: number, steps: readonly CompactStep[]): CompactCount {
    if (!Number.isFinite(count) || count < 0) {
        return { value: 0, magnitude: 'none' };
    }
    // 取最高的适用档；一档都够不上就原样显示
    let index = -1;
    for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        if (step && count >= step.unit) {
            index = i;
        }
    }
    const current = index >= 0 ? steps[index] : undefined;
    if (!current) {
        return { value: Math.round(count), magnitude: 'none' };
    }
    const value = scale(count, current.unit);
    const next = steps[index + 1];
    // 折算后的舍入可能刚好顶到下一档（99999999 → 「10000万」）：升档重算成「1亿」
    if (next && value * current.unit >= next.unit) {
        return { value: scale(count, next.unit), magnitude: next.magnitude };
    }
    return { value, magnitude: current.magnitude };
}

/**
 * 按中文习惯（万 / 亿）分档：万以下原样
 * 供 zh-CN / zh-TW 使用
 */
export function toCompactCountCJK(count: number): CompactCount {
    return toCompact(count, CJK_STEPS);
}

/**
 * 按英文习惯（K / M）分档：千以下原样
 * 供 en-US 使用
 */
export function toCompactCountLatin(count: number): CompactCount {
    return toCompact(count, LATIN_STEPS);
}
