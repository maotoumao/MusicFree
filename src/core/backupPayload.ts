import { compare, validate } from "compare-versions";

/**
 * 备份文件正文的解析与归一化。
 * 这里只管「把外部来的 JSON 认出来」，不管恢复动作本身（在 backup.ts）。
 */

/** 备份里的一条插件记录；v2 信封会多带 enabled 等本端不消费的字段 */
export interface IBackupPluginEntry {
    srcUrl?: string;
    version?: string;
    [extra: string]: unknown;
}

export interface IBackupPayload {
    musicSheets: IMusic.IMusicSheetItem[];
    plugins: IBackupPluginEntry[];
}

/**
 * 备份存在两代格式，读端必须都认：
 * - v1：本 app backup() 写出的扁平结构 { musicSheets, plugins: [] }
 * - v2 信封：{ format, version, origin, sections: { musicSheets, plugins: { installed, ... } } }
 *
 * 只认 v1 时读 v2 会在顶层解构出两个 undefined，
 * 紧接着 sheets.length 抛 TypeError，用户只看到一句「恢复失败」，看不出是格式问题。
 */
export function normalizeBackupPayload(raw: string | unknown): IBackupPayload {
    const root = typeof raw === "string" ? parseJson(raw) : raw;
    const body = asRecord(root) ?? {};
    /** v2 的数据在 sections 里；v1 直接就是 body 本身 */
    const content = asRecord(body.sections) ?? body;

    const musicSheets = Array.isArray(content.musicSheets)
        ? (content.musicSheets as IMusic.IMusicSheetItem[])
        : [];
    const plugins = pickPluginEntries(content.plugins);

    if (!Array.isArray(content.musicSheets) && content.plugins == null) {
        throw new Error("无法识别的备份文件：缺少 musicSheets 与 plugins 字段");
    }

    return { musicSheets, plugins };
}

/**
 * 取插件列表。
 * v1 是数组；v2 把插件分成 installed / subscriptions / alternatives，
 * 其中只有 installed 是「能直接按链接装的」，subscriptions 归订阅功能管，本端不消费。
 */
function pickPluginEntries(raw: unknown): IBackupPluginEntry[] {
    const list = Array.isArray(raw)
        ? raw
        : asRecord(raw) && Array.isArray((raw as { installed?: unknown }).installed)
            ? ((raw as { installed: unknown[] }).installed)
            : null;
    if (!list) {
        return [];
    }

    return list.filter(
        it => asRecord(it) && typeof (it as IBackupPluginEntry).srcUrl === "string",
    ) as IBackupPluginEntry[];
}

/**
 * 本地版本是否已不低于备份版本（可以不装）。
 *
 * 任一侧不是合法 semver 就返回 false（宁可重装）：本地插件多为本地文件导入，
 * 常常没有 version 字段或写成空串，而 compare 遇到空串会抛 Invalid argument，
 * 抛出来会让整次恢复中途失败。
 */
export function isLocalVersionNotOlder(
    localVersion?: string,
    backupVersion?: string,
): boolean {
    /** 备份没写版本时按 0.0.1 算：本地无版本（0.0.0）时仍会重装，保持原有语义 */
    const local = localVersion?.trim() || "0.0.0";
    const backup = backupVersion?.trim() || "0.0.1";
    if (!validate(local) || !validate(backup)) {
        return false;
    }

    return compare(local, backup, ">=");
}

function parseJson(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        throw new Error("备份文件格式无效（不是合法的 JSON）");
    }
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}
