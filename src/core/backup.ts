/** 备份与恢复 */
/** 歌单、插件 */
import PluginManager from "./pluginManager";
import MusicSheet from "@/core/musicSheet";
import { ResumeMode } from "@/constants/commonConst.ts";
import {
    IBackupPluginEntry,
    isLocalVersionNotOlder,
    normalizeBackupPayload,
} from "./backupPayload";

/**
 * 结果：一份大的json文件
 * {
 *     musicSheets: [],
 *     plugins: [],
 * }
 */

export interface IBackupResumeResult {
    sheetCount: number;
    /** 已在本地且不低于备份版本的插件数 */
    skippedPlugins: number;
    failedPlugins: Array<{ srcUrl: string; reason: string }>;
}

function backup() {
    const musicSheets = MusicSheet.backupSheets();
    const plugins = PluginManager.getEnabledPlugins();
    const normalizedPlugins = plugins.map(_ => ({
        srcUrl: _.instance.srcUrl,
        version: _.instance.version,
    }));

    return JSON.stringify({
        musicSheets: musicSheets,
        plugins: normalizedPlugins,
    });
}

async function resume(
    raw: string | Object,
    resumeMode: ResumeMode = ResumeMode.Append,
): Promise<IBackupResumeResult> {
    const { plugins, musicSheets } = normalizeBackupPayload(raw);
    /**
     * 曲目里的 platform 原样入库，不在这里改写。
     * 别名本来就是这个音源对外的名字，认不认得它是取源时 platformMatch 的事；
     * 在这儿改一次、取源时又认一次，两处规则迟早对不上。
     */

    /**
     * 歌单先行：它不依赖网络，是备份的主体数据。
     * 放在插件之后会让某个插件下载失败连带歌单一起回滚不了（原实现是 Promise.all 一起等）。
     */
    await MusicSheet.resumeSheets(musicSheets, resumeMode);

    const installedPlugins = PluginManager.getEnabledPlugins();
    const resumeResults = await Promise.allSettled(
        plugins.map(
            async (
                entry: IBackupPluginEntry,
            ): Promise<{ success?: boolean; skipped?: boolean; message?: string }> => {
                // 校验是否安装过: 同源且本地版本更高就忽略掉
                const isInstalled = installedPlugins.some(
                    plugin =>
                        plugin.instance.srcUrl === entry.srcUrl &&
                        isLocalVersionNotOlder(plugin.instance.version, entry.version),
                );
                if (isInstalled) {
                    return { success: true, skipped: true };
                }

                return PluginManager.installPluginFromUrl(entry.srcUrl!);
            },
        ),
    );

    let skippedPlugins = 0;
    const failedPlugins: IBackupResumeResult["failedPlugins"] = [];
    resumeResults.forEach((result, index) => {
        const srcUrl = plugins[index].srcUrl!;
        if (result.status === "rejected") {
            failedPlugins.push({ srcUrl, reason: result.reason?.message ?? `${result.reason}` });
        } else if (result.value?.skipped) {
            ++skippedPlugins;
        } else if (!result.value?.success) {
            failedPlugins.push({ srcUrl, reason: result.value?.message || "安装失败" });
        }
    });

    /**
     * 有失败就抛，让界面别报「恢复成功」；
     * 但歌单已经落库了，所以要说清「歌单进去了、只有插件没装上」，别让人以为整次恢复没生效。
     */
    if (failedPlugins.length) {
        const detail = failedPlugins
            .slice(0, 3)
            .map(_ => `${_.srcUrl}（${_.reason}）`)
            .join("、");
        const more = failedPlugins.length > 3 ? ` 等 ${failedPlugins.length} 项` : "";
        throw new Error(
            `歌单已恢复（${musicSheets.length} 个），但 ${failedPlugins.length} 个插件未装上：${detail}${more}`,
        );
    }

    return {
        sheetCount: musicSheets.length,
        skippedPlugins,
        failedPlugins,
    };
}

const Backup = {
    backup,
    resume,
};
export default Backup;
