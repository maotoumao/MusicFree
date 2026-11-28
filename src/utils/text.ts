/**
 * 文本编码成 UTF-8 后的字节数
 * 用于只有内存字符串、没有可 stat 的文件时判定体积
 * 按 code point 迭代：孤立代理项会被编码器换成 U+FFFD，按 3 字节计，与 truncateToUtf8Bytes 同口径
 */
export function utf8ByteLength(text: string): number {
    let bytes = 0;
    for (const ch of text) {
        const cp = ch.codePointAt(0) ?? 0;
        bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    }
    return bytes;
}

/** 编辑距离（Levenshtein）：a 变成 b 的最少单字符增删改次数；滚动数组实现 */
export function minDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) {
        return n;
    }
    if (n === 0) {
        return m;
    }
    let prev: number[] = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
        const cur: number[] = [i];
        for (let j = 1; j <= n; j++) {
            const del = (prev[j] ?? 0) + 1;
            const ins = (cur[j - 1] ?? 0) + 1;
            const sub = (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
            cur[j] = Math.min(del, ins, sub);
        }
        prev = cur;
    }
    return prev[n] ?? 0;
}

/**
 * 取参数中首个「trim 后非空」的字符串，返回其 trim 后的值；无则 undefined
 * 用于展示字段回退（详情 → 入口 → fallback）：过滤非字符串 / 空串 / 全空白（不可信来源如插件返回）
 */
export function firstNonBlank(...values: unknown[]): string | undefined {
    for (const value of values) {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) {
                return trimmed;
            }
        }
    }
    return undefined;
}

/**
 * 截断到最大 UTF-16 码元数；上限恰落在代理对中间时回退一码元，避免切出孤立代理
 * 对要持久化的文本按长度封顶用（普通 `.slice` 会劈裂 emoji 等代理对、产出损坏字符）
 */
export function clampToMaxLength(value: string, max: number): string {
    if (value.length <= max) {
        return value;
    }
    // 位置 max-1 是高代理 → 其低代理在 max 处会被切掉，连高代理一并回退
    const lastKept = value.charCodeAt(max - 1);
    const end = lastKept >= 0xd800 && lastKept <= 0xdbff ? max - 1 : max;
    return value.slice(0, end);
}

/**
 * 截断到最大 UTF-8 字节数，按 code point 迭代避免切断代理对
 * 与 clampToMaxLength（UTF-16 码元）互补：用于文件名 / 存储等按字节封顶的场景
 */
export function truncateToUtf8Bytes(text: string, maxBytes: number): string {
    let bytes = 0;
    let result = '';
    for (const ch of text) {
        const cp = ch.codePointAt(0) ?? 0;
        const len = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
        if (bytes + len > maxBytes) {
            break;
        }
        bytes += len;
        result += ch;
    }
    return result;
}

/**
 * 文件名消毒：去文件系统非法字符与控制字符、折叠空白、按 UTF-8 字节截断（保 code point 完整）
 * 返回可安全落盘的文件名基或空串（空 / `.` / `..` 等非法路径段一律归空，由调用方定回退名）
 */
export function sanitizeFileName(name: string, maxBytes: number): string {
    const cleaned = name
        // 控制字符（\x00–\x1f）是有意消毒的目标：文件名不能含它们
        // eslint-disable-next-line no-control-regex
        .replace(/[/\\:*?"<>|\u0000-\u001f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const truncated = truncateToUtf8Bytes(cleaned, maxBytes).trim();
    return truncated === '.' || truncated === '..' ? '' : truncated;
}
