/**
 * 歌词搜索候选生成器
 *
 * 针对歌单/本地音乐中常见的 "序号 作者 - 歌名" 类标题,
 * 生成多组搜索词依次尝试, 提高自动匹配歌词的命中率:
 *
 *   "11.11 伍佰 - 梦醒时分"
 *     → ["11.11 伍佰 - 梦醒时分", "伍佰 - 梦醒时分", "伍佰",
 *        "梦醒时分", "梦醒时分 伍佰"]
 *
 * 期望歌名 (targetTitle) 取横杠拆分后的最后一段 (或去序号后的完整标题),
 * 用于结果匹配时的编辑距离基准。
 */

/** 横杠分隔 (两侧带空格的 - / – / —) */
const DASH_SPLIT = /\s+[-–—]\s+/;

/**
 * 前导序号 (要求后跟显式分隔符, 避免误伤 "7 rings" 这类歌名):
 *   01. / 1、 / 1- / (1) / 11.11 等
 */
const LEADING_INDEX_WITH_SEP = /^\s*\d{1,3}(?:\.\d{1,3})?\s*[.\-–—、·．)）]\s*/;

/** 前导纯数字序号 + 空格 (仅在标题含横杠结构时剥离) */
const LEADING_INDEX_LOOSE = /^\s*\d{1,3}(?:\.\d{1,3})?\s+/;

export interface LyricSearchVariants {
    /** 搜索词候选 (按优先级排列, 已去重) */
    queries: string[];
    /** 期望歌名 (用于编辑距离基准) */
    targetTitle: string;
}

export function buildLyricSearchVariants(rawTitle: string): LyricSearchVariants {
    const title = (rawTitle ?? "").trim();
    const queries: string[] = [];
    const push = (q?: string) => {
        const t = (q ?? "").trim();
        if (t && t.length >= 2 && !queries.includes(t)) {
            queries.push(t);
        }
    };

    // 原始标题优先
    push(title);

    const hasDash = DASH_SPLIT.test(title);

    // 剥离前导序号
    let stripped = title;
    if (hasDash) {
        stripped = title.replace(LEADING_INDEX_LOOSE, "").trim();
    } else {
        stripped = title.replace(LEADING_INDEX_WITH_SEP, "").trim();
    }
    if (stripped && stripped !== title) {
        push(stripped);
    }

    // 横杠拆分
    const parts = stripped
        .split(DASH_SPLIT)
        .map(_ => _.trim())
        .filter(_ => _.length >= 2);

    if (parts.length >= 2) {
        // 各段单独作为候选
        for (const p of parts) {
            push(p);
        }
        // 歌名本身可能含横杠: 除首段(作者)外的相邻段组合
        if (parts.length >= 3) {
            for (let i = 1; i < parts.length - 1; i++) {
                push(parts.slice(i).join(" - "));
            }
        }
        // 歌名 + 作者 组合
        push(parts.slice(1).join(" "));
        push(parts.slice(1).join(" - ") + " " + parts[0]);
    }

    const targetTitle =
        parts.length >= 3
            ? parts.slice(1).join(" - ")
            : parts.length === 2
                ? parts[1]
                : stripped || title;

    return {
        queries: queries.slice(0, 8),
        targetTitle,
    };
}
