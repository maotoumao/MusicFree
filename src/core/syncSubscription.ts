/**
 * 歌单订阅同步
 *
 * 背景：歌单导入进来之后就没记住「从哪来的」，所以没法再次拉取。
 * 本模块负责：按歌单上记的 subscription（分享链接 + 来源插件），
 * 重新调插件的 importMusicSheet 把源歌单拉回来，和本地做 diff 后合并。
 *
 * 三条底线：
 * 1. 任何一步失败都不能破坏已有歌单数据（所有写回都放在 diff 成功之后）
 * 2. 只认「同步来的歌」（带 $sync 标记），用户手动加的歌永不删除
 * 3. 插件返回空数组一律视为异常，绝不因此清空歌单
 */
import MusicSheet from "@/core/musicSheet";
import PluginManager from "@/core/pluginManager";
import { errorLog } from "@/utils/log";

/** 同步结果 */
export interface ISyncResult {
    sheetId: string;
    status: "success" | "partial" | "failed";
    /** 本次新增的歌曲 */
    added: IMusic.IMusicItem[];
    /** 源端已消失的歌曲（带 $sync 标记的那部分） */
    missing: IMusic.IMusicItem[];
    error?: string;
}

/** 自动同步的周期：距上次同步超过这个时长才触发 */
const AUTO_SYNC_INTERVAL = 12 * 60 * 60 * 1000;
/** 单次自动同步最多处理几个歌单，避免一次打爆插件接口被限流 */
const MAX_AUTO_SYNC_COUNT = 3;
/** 单次同步失败最多重试次数 */
const MAX_RETRY = 1;

/** 全局锁：防止用户连点按钮触发重复请求 */
let syncing = false;

/**
 * 这个歌单能不能同步
 * 旧歌单没有 subscription 字段，同步功能对它们不可用
 */
export function isSyncable(sheet?: IMusic.IMusicSheetItemBase | null) {
    return !!(sheet?.subscription?.url && sheet?.subscription?.platform);
}

/**
 * 取插件声明的主键
 * primaryKey 用于判定「同一首歌」，各插件可能不同，必须动态读，不能硬编码 id
 */
function getPrimaryKeys(plugin: any): string[] {
    const declared: unknown = plugin?.instance?.primaryKey;
    if (Array.isArray(declared) && declared.length) {
        const keys = declared.filter(
            (it): it is string => typeof it === "string" && it.length > 0,
        );
        if (keys.length) {
            return keys;
        }
    }
    return ["id"];
}

/**
 * 构造判重用的唯一 key
 * 同一首歌在不同插件里 platform 不同，必须带上 platform
 */
function buildKey(item: IMusic.IMusicItem, primaryKeys: string[]) {
    return [item.platform, ...primaryKeys.map(k => String((item as any)[k] ?? ""))].join("::");
}

/**
 * 计算本地与远端的差异
 * - toAdd：远端有、本地没有
 * - missing：本地有、且是同步来的、但远端已经没有了
 */
function diffMusicList(
    localList: IMusic.IMusicItem[],
    remoteList: IMusic.IMusicItem[],
    primaryKeys: string[],
) {
    const localMap = new Map(
        localList.map(i => [buildKey(i, primaryKeys), i] as const),
    );
    const remoteMap = new Map(
        remoteList.map(i => [buildKey(i, primaryKeys), i] as const),
    );

    const toAdd = remoteList.filter(i => !localMap.has(buildKey(i, primaryKeys)));

    // 只把「同步来的」算作缺失，用户手动加的不动
    const missing = localList.filter(
        i => i.$sync?.fromSubscription && !remoteMap.has(buildKey(i, primaryKeys)),
    );

    return { toAdd, missing };
}

/** 追加前再做一次同批内去重，remote 自身可能有重复条目 */
function dedupe(items: IMusic.IMusicItem[], primaryKeys: string[]) {
    const seen = new Set<string>();
    return items.filter(it => {
        const key = buildKey(it, primaryKeys);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

/** 把subscription的变更写回歌单（保留原有字段） */
async function patchSubscription(
    sheetId: string,
    patch: Partial<IMusic.ISubscription>,
) {
    const sheet = MusicSheet.getSheetBase(sheetId);
    if (!sheet) {
        return;
    }
    await MusicSheet.updateMusicSheetBase(sheetId, {
        subscription: {
            ...(sheet.subscription as IMusic.ISubscription),
            ...patch,
        },
    });
}

/** 从分享链接里尽力解析出源站歌单 id，用于比对是否换源 */
function parseSheetIdInSource(url: string): string | undefined {
    try {
        const matched = url.match(/[?&#/](?:id|listid|playlistid)[=/](\w+)/i);
        return matched?.[1];
    } catch {
        return undefined;
    }
}

/**
 * 同步单个歌单
 * @param sheetId 本地歌单 id
 */
export async function syncSheet(sheetId: string): Promise<ISyncResult> {
    const fail = (error: string): ISyncResult => ({
        sheetId,
        status: "failed",
        added: [],
        missing: [],
        error,
    });

    const sheet = MusicSheet.getSheetBase(sheetId);
    if (!isSyncable(sheet)) {
        return fail("歌单没有订阅来源");
    }

    const subscription = sheet!.subscription as IMusic.ISubscription;

    // 1. 回查插件；插件被卸载/禁用就没法同步了
    const plugin: any = PluginManager.getByName(subscription.platform);
    if (!plugin) {
        await patchSubscription(sheetId, {
            lastSyncStatus: "failed",
            lastSyncError: "插件缺失",
        });
        return fail("插件缺失");
    }

    // 2. 拉取远端；失败最多重试一次
    let remoteList: IMusic.IMusicItem[] = [];
    let lastError: string = "未知错误";
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
        try {
            remoteList = (await plugin.methods?.importMusicSheet?.(
                subscription.url,
            )) ?? [];
            if (remoteList.length > 0) {
                lastError = "";
                break;
            }
            lastError = "未拉取到歌曲";
        } catch (e: any) {
            lastError = e?.message || "拉取失败";
            errorLog("同步歌单失败", e);
        }
    }

    // 3. 空数组一律视为异常：可能是插件失效、歌单私密或链接失效，
    //    绝不能当成「源端清空了」去删歌
    if (!remoteList.length) {
        await patchSubscription(sheetId, {
            lastSyncStatus: "failed",
            lastSyncError: lastError,
        });
        return fail(lastError);
    }

    // 4. diff
    const primaryKeys = getPrimaryKeys(plugin);
    const localList = MusicSheet.getSortedMusicListBySheetId(sheetId).musicList;
    const { toAdd, missing } = diffMusicList(localList, remoteList, primaryKeys);
    const toAddUnique = dedupe(toAdd, primaryKeys);

    // 5. 应用变更（append 只追加；mirror 额外移除源端已消失的同步项）
    const now = Date.now();
    const result: ISyncResult = {
        sheetId,
        status: "success",
        added: toAddUnique,
        missing,
    };

    try {
        if (toAddUnique.length) {
            await MusicSheet.addMusic(
                sheetId,
                toAddUnique.map(it => ({
                    ...it,
                    $sync: {
                        fromSubscription: true as const,
                        syncedAt: now,
                    },
                })),
            );
        }

        const mirror = subscription.syncMode === "mirror";
        if (mirror && missing.length) {
            await MusicSheet.removeMusic(sheetId, missing);
            result.status = "partial";
        } else if (missing.length) {
            // append 模式下只提示，不删除
            result.status = "partial";
        }

        await patchSubscription(sheetId, {
            lastSyncAt: now,
            lastSyncStatus: result.status,
            lastSyncError: undefined,
            addedCount: toAddUnique.length,
            missingCount: missing.length,
            sheetIdInSource: parseSheetIdInSource(subscription.url),
        });
    } catch (e: any) {
        errorLog("同步歌单写入失败", e);
        await patchSubscription(sheetId, {
            lastSyncStatus: "failed",
            lastSyncError: e?.message || "写入失败",
        });
        return fail(e?.message || "写入失败");
    }

    return result;
}

/**
 * 同步全部（或只同步开了自动同步的）歌单
 * @param autoOnly true 时只处理 subscription.autoSync 为真的歌单
 */
export async function syncAll(autoOnly = false): Promise<ISyncResult[]> {
    if (syncing) {
        return [];
    }
    syncing = true;
    try {
        const sheets = MusicSheet.getSheetsBase() ?? [];
        let targets = sheets.filter(isSyncable);
        if (autoOnly) {
            const now = Date.now();
            targets = targets
                .filter(it => it.subscription?.autoSync)
                .filter(
                    it =>
                        !it.subscription?.lastSyncAt ||
                        now - it.subscription.lastSyncAt > AUTO_SYNC_INTERVAL,
                )
                .slice(0, MAX_AUTO_SYNC_COUNT);
        }

        // 串行执行，避免并发打爆插件接口
        const results: ISyncResult[] = [];
        for (const sheet of targets) {
            results.push(await syncSheet(sheet.id));
        }
        return results;
    } finally {
        syncing = false;
    }
}

/** 是否正在同步中（UI 用来禁用按钮） */
export function isSyncing() {
    return syncing;
}

/** 给歌单挂上订阅来源（导入歌单时调用） */
export async function subscribeSheet(
    sheetId: string,
    url: string,
    platform: string,
) {
    await patchSubscription(sheetId, {
        url,
        platform,
        sheetIdInSource: parseSheetIdInSource(url),
    });
}

/** 解除订阅：清掉订阅信息，歌曲保留 */
export async function unsubscribeSheet(sheetId: string) {
    await MusicSheet.updateMusicSheetBase(sheetId, {
        subscription: undefined,
    });
}

export default {
    syncSheet,
    syncAll,
    isSyncable,
    isSyncing,
    subscribeSheet,
    unsubscribeSheet,
};
