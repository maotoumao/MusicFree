/**
 * 已下载库：本机下载过的歌与它们的文件产物
 *
 * 与传输侧的分界是**该不该活过完成那一刻**——任务完成即毕业出活动队列，改由这里长期持有。
 * 它同时回答三个问题：下载页「已完成」列出哪些歌、这首歌下过没、离线播放该开哪个文件
 *
 * 一首歌只留一份文件（设计 §5），故条目就是 `mediaKey → 一份文件`。
 *
 * **不删文件**：磁盘上的文件归 `localMusic`，本模块只听它广播的「文件已删除」、
 * 把自己那份记录收拾干净（设计 §6）
 */
import { mediaKey } from '@/utils/media';
import { filePathKey } from '@/utils/path';

import {
    getDownloadedEntries,
    openDownloadedStore,
    readDownloaded,
    removeDownloaded,
    writeDownloaded,
} from './store';

import type {
    DownloadedEntry,
    RecordDownloadedFileInput,
    RecordDownloadedFileResult,
} from './types';
import type { IMediaMeta } from '@/core/mediaMeta';
import type { MediaRef } from '@/types';

export class DownloadedLibrary {
    readonly #mediaMeta: IMediaMeta;

    constructor(deps: { mediaMeta: IMediaMeta }) {
        this.#mediaMeta = deps.mediaMeta;
    }

    /**
     * 落一份已下载文件（下载完成入账）：整条替换
     * 一首歌只留一份文件（设计 §5），故新文件直接顶掉旧的；
     * 要不要为更高音质重下是入队时就判完的（§5.1 降级保护），此处不再取舍
     */
    recordFile(input: RecordDownloadedFileInput): RecordDownloadedFileResult {
        const key = mediaKey(input.item);
        const existing = this.#read(key);
        const saved = this.#put({
            item: existing?.item ?? input.item,
            mediaKey: key,
            file: input.file,
        });
        // 落库校验对读侧宽容、对写侧严格：本次要落的这份若被丢掉，
        // 还报成功会让调用方误以为已入账
        if (saved?.file.path !== input.file.path) {
            return null;
        }
        this.#anchor(saved);
        // 被顶掉的旧文件已无人引用，交还调用方删盘；同路径覆写则无物可删
        const replaced = existing?.file.path;
        return replaced !== undefined && replaced !== saved.file.path
            ? { supersededPath: replaced }
            : {};
    }

    /** 按 MediaRef 查已下载条目（未下载则 undefined）；O(1) 单键读 */
    get(ref: MediaRef): DownloadedEntry | undefined {
        return this.#read(mediaKey(ref));
    }

    /**
     * 移除下载记录：只从下载库删掉这一条，**不动磁盘文件、不动本地库、不动播放锚点**
     *
     * 不需要墓碑：扫描只写本地库、从不重建下载记录，删了就不会被扫回来。
     * 锚点记的是「这个身份在本地有个文件」这个**文件事实**，与它在不在某个列表里无关，
     * 清掉只会把刚删过记录的歌变成「明明有本地文件却要联网播」
     */
    forget(ref: MediaRef): boolean {
        const key = mediaKey(ref);
        if (!this.#read(key)) {
            return false;
        }
        return this.#remove(key);
    }

    /**
     * 文件已被删除：摘掉指向它们的下载记录
     *
     * 一条记录以「本机有这个文件」为前提：文件没了它就不再属于「一个可以听的集合」（设计 §1.2）；
     * 留着会让「已完成」的「播放全部」对着不存在的文件回退到联网播
     *
     * 反查走内存镜像（不用 parse 全库 JSON），删之前再回 MMKV 确认一次：
     * 镜像的发布晚一个微任务，拿它当删除依据会误伤已经改指到别的文件的记录
     *
     * 残留窗口：批量删除是分批 unlink 的，若在后续批次期间同一首歌重下完成、
     * 又碰巧落回刚腾出的同一路径，这里会把那条新记录一并摘掉。后果是丢一条下载记录
     * （文件还在、仍在本地库里、照样能播）；单首删除无此窗口
     */
    onFilesDeleted(paths: readonly string[]): void {
        const gone = new Set(paths.map(filePathKey));
        // 先取快照再遍历：#remove 会经监听同步改动镜像本身
        for (const [key, mirrored] of [...getDownloadedEntries()]) {
            if (!gone.has(filePathKey(mirrored.file.path))) continue;
            const latest = this.#read(key);
            if (latest && gone.has(filePathKey(latest.file.path))) {
                // 锚点是本模块写下的（#anchor），文件没了自然也归本模块清。
                // 不能指望 localMusic 代劳：它按 path 反查 ref，而库可能已被清空或移除过
                try {
                    this.#mediaMeta.clearLocalFile(
                        latest.item,
                        latest.file.path,
                    );
                } catch {
                    // 锚点清不掉只是留个指不到文件的记号，播放侧会优雅降级；不能因此不摘记录
                }
                this.#remove(key);
            }
        }
    }

    /** 单键读原始条目：单曲下载态查询在歌曲菜单等处高频调用，故不走运行时 Map */
    #read(key: string): DownloadedEntry | undefined {
        try {
            const store = openDownloadedStore();
            return store === null ? undefined : readDownloaded(store, key);
        } catch {
            return undefined;
        }
    }

    /**
     * 落库；返回落库后的规范化条目（失败返 undefined，不向上抛）
     * 只写 MMKV：供 React 读的镜像由 store 的监听自己跟上，此处不必也不该手工同步
     */
    #put(entry: DownloadedEntry): DownloadedEntry | undefined {
        try {
            const store = openDownloadedStore();
            return store === null ? undefined : writeDownloaded(store, entry);
        } catch {
            return undefined; // MMKV 开库 / 写版本号 / 写记录抛错：按契约报失败
        }
    }

    /** 从已下载库彻底移除一条；返回是否确实删掉 */
    #remove(key: string): boolean {
        try {
            const store = openDownloadedStore();
            if (store === null) return false;
            removeDownloaded(store, key);
            return true;
        } catch {
            // 扫描不再重建下载记录，没有「下次自动收敛」这回事，故如实回报失败
            return false;
        }
    }

    /** 把离线播放锚点指向这首歌的文件 */
    #anchor(entry: DownloadedEntry): void {
        this.#mediaMeta.setDownloadData(entry.item, {
            path: entry.file.path,
            quality: entry.file.resolvedQuality,
        });
    }
}
