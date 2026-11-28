/**
 * 下载模块的对外端口与组装入口
 *
 * 模块按**该不该活过完成那一刻**分成两侧：
 * - `transfer/` —— 入队到落盘之间的传输过程（registry / scheduler / source / identity /
 *   completion，以及进度与队列镜像）。完成即消散
 * - `downloaded/` —— 下载过的歌与文件产物，长期保留
 *
 * 本文件是两侧的门面：装配它们、把端口方法接过去，并合成用户眼里统一的下载态
 *
 * 一首歌从点下载到进本地库，要经过：
 * 1. `enqueue()` 把它写进 `registry`（`pending`），并唤醒调度
 * 2. `scheduler` 在并发上限与任务间隔允许时取走一条，经 `source` 解析出直链、经 `identity`
 *    算出这次传输的身份，**先把身份落库再**交给原生引擎
 * 3. 原生把传输过程以事件回报，`scheduler` 据此刷 `transfer/store` 里的进度与 registry 里的状态
 * 4. 原生传输完成并发布文件后，`completion` 接手归档：
 *    写进已下载库与本地音乐库 → 移出队列 → 确认原生回执
 * 5. `setup()` 负责重启后的收敛：与原生对账 → 补录漏掉的完成 → 清没人认领的断点文件
 *
 * 三份状态各有分工：`registry` 持久化「还没下完的任务」，已下载库持有「已下完的文件」，
 * `transfer/store` 只放进度这类重启即弃的运行时数据。`getRecord()` 把前两者合成统一的下载态。
 *
 * `scheduler` 与 `completion` 是两个协作者，但**共用同一个 `KeyedLock`**——
 * 同一首歌的状态变更必须互斥；各自使用不同的锁无法实现互斥
 *
 * 用户命令（暂停 / 继续 / 重试 / 取消）一律按同一条准则裁决：**名下有没有正在跑的 worker**。
 * 有则只发指令、状态等原生事件；没有则就地改，但原生若仍持有该任务还得请它放手
 */
import { ensureWritableDir } from '@/infra/fileSystem';
import { defaultDownloadDir } from '@/infra/paths';
import {
    downloadEngine,
    isDownloadEngineSupported,
} from '@/native/downloadEngine';
import { isLocalPlatform, isQualityBelow, mediaKey } from '@/utils/media';

import { DownloadedLibrary } from './downloaded';
import {
    isDefaultDownloadDir,
    normalizeDownloadDir,
    resolveDownloadDir,
} from './downloadPath';
import { CompletionCommitter } from './transfer/completion';
import { KeyedLock } from './transfer/keyedLock';
import { DownloadRegistry } from './transfer/registry';
import { Scheduler } from './transfer/scheduler';

import type { DownloadedEntry } from './downloaded/types';
import type { TransferIdentity } from './transfer/types';
import type {
    DownloadDeps,
    DownloadRecord,
    IDownload,
    SetDownloadDirResult,
} from './types';
import type { IConfig } from '@/core/config';
import type { DeepReadonly, MediaRef, MusicItem } from '@/types';

export class Download implements IDownload {
    readonly #config: IConfig;
    readonly #downloaded: DownloadedLibrary;
    readonly #registry = new DownloadRegistry();
    /**
     * 一首歌的传输操作串行执行：完成入账与用户的暂停 / 继续 / 重试 / 取消会同时到达，
     * 每一个都是「读状态 → 异步 I/O → 写状态」，不串行就会互相覆盖
     * 调度与入账共用同一把锁，才能真正互斥
     *
     * 只盖传输侧。已下载库不入这把锁：它不删盘，只在收到「文件已删除」广播时同步记一笔账
     */
    readonly #lock = new KeyedLock();
    /**
     * 正在改下载目录：重入直接 `changing`
     * 两次修改重叠会让「新目录此刻没人写」这个前提失效——前一次已经把配置切到 B、
     * 新任务开始往 B 写，后一次还在清 B。UI 的按钮态挡不住这个（换个分区再回来就重建了），
     * 必须在端口这一层串行
     */
    #changingDownloadDir = false;
    readonly #completion: CompletionCommitter;
    readonly #scheduler: Scheduler;
    /** 共享的一次性启动：重复调用复用同一次，避免重复扫盘与重复注册 */
    #setupOnce: Promise<void> | undefined;

    /** 上一次分配出去的入队时间，保证进程内严格递增 */
    #lastEnqueuedAt = 0;

    constructor(deps: DownloadDeps) {
        this.#config = deps.config;
        this.#downloaded = new DownloadedLibrary({
            mediaMeta: deps.mediaMeta,
        });
        // 删文件的属主是 localMusic，本模块只是听着、把自己那份记录收拾干净。
        // 不订阅的话，跨模块一致性就得摊派给每一个 UI 删除入口，漏一个就是悬空记录（设计 §6）
        deps.localMusic.subscribeFilesDeleted(paths => {
            this.#downloaded.onFilesDeleted(paths);
        });
        this.#completion = new CompletionCommitter({
            registry: this.#registry,
            localMusic: deps.localMusic,
            recordDownloadedFile: input => this.#downloaded.recordFile(input),
            lock: this.#lock,
        });
        this.#scheduler = new Scheduler({
            registry: this.#registry,
            config: deps.config,
            plugins: deps.pluginManager,
            lock: this.#lock,
            onCompleted: event => {
                this.#completion.commit(event).catch(() => undefined);
            },
        });
    }

    setup(): Promise<void> {
        this.#setupOnce ??= this.#runSetup();
        return this.#setupOnce;
    }

    enqueue(items: readonly DeepReadonly<MusicItem>[]): number {
        const requestedQuality =
            this.#config.get('basic.defaultDownloadQuality') ?? 'standard';
        let accepted = 0;
        for (const item of items) {
            // 本地来源的歌指向设备上已有的 file:// 文件，没有可供下载的 HTTP 源；
            // 挡在入队处而非各个入口：这是「下载」这件事的内在规则，
            // 批量入口没法像单曲面板那样靠隐藏躲开
            if (isLocalPlatform(item.platform)) {
                continue;
            }
            const key = mediaKey(item);
            if (this.#registry.get(key)) {
                continue; // 已在队列里，重复点不叠加任务
            }
            // 只升不降：已有不低于设置档的文件就跳过，只有更低档才重下升级。
            // 绝不自动把更高音质换掉——用户把默认档调低后重下歌单，
            // 手动下过的无损不该被静默覆盖
            const owned = this.#downloaded.get(item)?.file;
            if (
                owned &&
                !isQualityBelow(owned.resolvedQuality, requestedQuality)
            ) {
                continue;
            }
            const put = this.#registry.put({
                item,
                mediaKey: key,
                state: 'pending',
                requestedQuality,
                enqueuedAt: this.#nextEnqueuedAt(),
            });
            if (put) {
                accepted++;
            }
        }
        if (accepted > 0) {
            this.#scheduler.pump();
        }
        return accepted;
    }

    /**
     * 入队时间，进程内严格递增
     * 直接用 `Date.now()` 会让同一批入队的歌拿到同一个值：先来先下就退化成了存储的枚举顺序，
     * 而「取消后立刻重新入队」也会因前后两条时间相同而被当成同一条，拿旧解析结果续下去
     */
    #nextEnqueuedAt(): number {
        const now = Date.now();
        this.#lastEnqueuedAt =
            now > this.#lastEnqueuedAt ? now : this.#lastEnqueuedAt + 1;
        return this.#lastEnqueuedAt;
    }

    /** 合并两处记录：在途任务在 registry，完成产物在已下载库 */
    getRecord(ref: MediaRef): DownloadRecord | undefined {
        const active = this.#registry.get(mediaKey(ref));
        if (active) {
            return active;
        }
        const entry = this.#downloaded.get(ref);
        return entry ? toDoneRecord(entry) : undefined;
    }

    // —— 用户命令：一律按 mediaKey 定位，实现委托给调度（它持有任务表与传输槽）——

    pause(ref: MediaRef): void {
        this.#scheduler.pause(mediaKey(ref));
    }

    resume(ref: MediaRef): void {
        this.#scheduler.resume(mediaKey(ref));
    }

    retry(ref: MediaRef): void {
        this.#scheduler.retry(mediaKey(ref));
    }

    cancel(ref: MediaRef): void {
        this.#scheduler.cancel(mediaKey(ref));
    }

    pauseAll(): void {
        this.#scheduler.pauseAll();
    }

    resumeAll(): void {
        this.#scheduler.resumeAll();
    }

    cancelAll(): void {
        this.#scheduler.cancelAll();
    }

    // —— 落盘目录 ——

    getDownloadDir(): string {
        return resolveDownloadDir(this.#config);
    }

    isUsingDefaultDownloadDir(): boolean {
        return isDefaultDownloadDir(this.#config);
    }

    setDownloadDir(path: string): Promise<SetDownloadDirResult> {
        const normalized = normalizeDownloadDir(path);
        return normalized === null
            ? Promise.resolve('invalid')
            : this.#changeDownloadDir(normalized);
    }

    resetDownloadDir(): Promise<SetDownloadDirResult> {
        // 空串而非默认目录的绝对路径：存的是「跟随默认」这个意思，默认目录换了也跟着走
        return this.#changeDownloadDir('');
    }

    /**
     * 换目录的全过程；`next` 为空串表示回默认
     * 顺序是刻意的：先把「改不了」的情形全挡掉（平台 / 可写性 / 目标目录清不干净），
     * 再落配置——半途失败不该留下一个指向写不进去的目录的配置
     *
     * **队列不为空也能换**：已交给原生的任务把落盘目录钉在了自己的传输身份上
     * （见 TransferIdentity.destDir），它们继续在原目录跑完；换目录只对此后新开的
     * 传输生效。故这里两趟清理都要放过那些仍活着的 `.part`
     */
    async #changeDownloadDir(next: string): Promise<SetDownloadDirResult> {
        if (!isDownloadEngineSupported) {
            return 'unsupported';
        }
        if (this.#changingDownloadDir) {
            return 'changing';
        }
        this.#changingDownloadDir = true;
        try {
            return await this.#applyDownloadDir(next);
        } finally {
            this.#changingDownloadDir = false;
        }
    }

    /** 换目录的实际步骤；由 #changeDownloadDir 保证同一时刻只有一趟在跑 */
    async #applyDownloadDir(input: string): Promise<SetDownloadDirResult> {
        // 用户在浏览器里手挑到 app 私有默认目录时，存的意思就是「跟随默认」——
        // 归一成空串，否则配置被钉成绝对路径，而 UI 此时不显示「恢复默认」，用户解不开
        const next = input === defaultDownloadDir ? '' : input;
        const current = resolveDownloadDir(this.#config);
        const target = next === '' ? defaultDownloadDir : next;
        if (target === current) {
            // 目录没变：不必探盘也不必清理。但存进去的**值**可能要改：手挑默认目录会被
            // 上面归一成空串，历史上存下的绝对路径也在这里被纠正成「跟随默认」，
            // 否则将来默认目录变了它不跟着走
            if (this.#config.get('basic.downloadPath') !== next) {
                this.#config.set('basic.downloadPath', next);
            }
            return 'ok';
        }
        /*
         * 两趟清理都要放过仍活着的 `.part`：任务的目录钉在传输身份上，来回换目录时
         * 「新目录」里完全可能躺着仍在跑的任务的断点（A → B → A）。视图不完整时建不出
         * 可信的存活集合——那时不敢删（可能误删用户仍可续传的断点），故按「清不干净」处理
         *
         * 这道闸是纯内存判断，排在探盘之前：反过来的话，一次注定要拒绝的修改会先把
         * 目标目录建出来，给用户留下一个他没得到的空文件夹
         */
        if (!this.#registry.isComplete()) {
            return 'staleFiles';
        }
        if (!(await ensureWritableDir(target))) {
            return 'notWritable';
        }
        const liveInTarget = this.#liveStagingKeysIn(target);
        // 新目录**必须在切配置之前**清：那里可能躺着上次用这个文件夹时被强杀留下的、
        // 从别的设备/别的安装带过来的、或上一轮换目录时留在这里的同名 `.part`
        // （keep-list 会放过仍钉着它的活任务，见上）。stagingKey 只由「歌 + 音质」决定，
        // 同一首歌重下会命中它并**无条件按已有长度续传**（`.part.meta` / If-Range 校验是
        // A4 欠账），把新字节接在陈旧字节后面 → 发布出一个损坏文件
        // 趁配置还指向旧目录清它，才能保证清的时候没有任何任务会往这个目录写；
        // 切完再清就成了「清一个活目录」——清理期间入队的任务正好会接管那个陈旧 `.part`
        //
        // 这一趟**承担正确性，不能尽力而为**：没清干净（目录列不出来 / 删除被拒 / 桥故障）
        // 就不敢切过去，否则等于放任下一次下载接管那段陈旧字节
        const unresolved = await downloadEngine
            .cleanupOrphans(target, liveInTarget)
            .catch(() => 1);
        if (unresolved > 0) {
            return 'staleFiles';
        }
        /*
         * 写配置之前的最后一件事：把还没记目录的**旧记录**钉在当前目录上
         *
         * 本字段之前落库的任务没有 destDir，`#transferDirOf` 对它们回落到「当前配置」
         * ——而当前配置正是下一行要改的东西。**这是最后一个还知道它们在哪的时刻**：
         * 写完配置，同一条记录的解释就翻成新目录了，于是
         * - 续传会把新目录递给原生，而原生手上记的是旧目录 → AlreadyActiveException；
         * - 下一次换目录时，它留在旧目录的断点会被当孤儿删掉。
         * 只在这一趟的 keep-list 里放过它们不够——那只护住当次清理，记录本身仍在漂
         *
         * 钉不下去（MMKV 写失败）就不敢切：那意味着此后再没有机会知道它们在哪
         */
        if (!this.#pinLegacyTransferDirs(current)) {
            return 'pinFailed';
        }
        // 存活集合与写配置之间不能有 await：让出之后新开的传输会钉新目录，
        // 而快照仍按旧配置解释（此刻起旧记录都已钉好，回落不再参与判断）
        const liveInCurrent = this.#liveStagingKeysIn(current);
        this.#config.set('basic.downloadPath', next);
        // 旧目录反过来：切完再清，且放过仍钉着它的那些任务的 `.part`
        // 清不掉（卷已拔出 / 无权限）只留下垃圾，不该回滚这次设置
        await downloadEngine
            .cleanupOrphans(current, liveInCurrent)
            .catch(() => undefined);
        return 'ok';
    }

    // —— 已下载库：实现在 downloaded/，此处只把端口接过去 ——

    getDownloaded(ref: MediaRef): DownloadedEntry | undefined {
        return this.#downloaded.get(ref);
    }

    forgetDownload(ref: MediaRef): boolean {
        return this.#downloaded.forget(ref);
    }

    /**
     * 把「有 transfer 却没记 destDir」的旧记录钉在 `dir` 上；全部落库成功才返回 true
     * 只在换目录前调用一次；此后 `#transferDirOf` 的回落分支对在途任务不再生效
     */
    #pinLegacyTransferDirs(dir: string): boolean {
        for (const record of this.#registry.list()) {
            const transfer = record.transfer;
            if (!transfer || transfer.destDir !== undefined) {
                continue;
            }
            const pinned = { ...transfer, destDir: dir };
            if (!this.#registry.put({ ...record, transfer: pinned })) {
                return false;
            }
        }
        return true;
    }

    /**
     * 仍钉在 `dir` 里的活任务的 stagingKey：孤儿清理据此放过它们的 `.part`
     * 没有 transfer 的任务（还没开始传）盘上没有 `.part`，不必登记
     * 只在 `registry.isComplete()` 时调用——视图不完整时这个集合不可信
     */
    #liveStagingKeysIn(dir: string): string[] {
        const keys: string[] = [];
        for (const record of this.#registry.list()) {
            if (
                record.transfer &&
                this.#transferDirOf(record.transfer) === dir
            ) {
                keys.push(record.transfer.stagingKey);
            }
        }
        return keys;
    }

    /**
     * 这份传输身份的 `.part` 躺在哪；旧记录没记 destDir 的按当前配置算
     * （本字段之前，当前配置是它当时唯一可能的目录）
     *
     * **取这个回落的时刻有语义**：换目录时必须在写配置之前解释旧记录，见 #applyDownloadDir
     */
    #transferDirOf(transfer: TransferIdentity | undefined): string {
        return transfer?.destDir ?? resolveDownloadDir(this.#config);
    }

    /**
     * 清掉上次进程留下的 `.part`：崩溃 / 被杀时断点文件会留在盘上，而其任务已不在队列里
     * 存活集合取自 registry 里**已开始传输**的任务（有 transfer 才可能有 `.part`），
     * 且用当时落盘的 stagingKey，不拿当前算法重算
     */
    async #cleanupOrphans(): Promise<void> {
        // 删文件不可逆：视图不完整时宁可漏删（多占点空间）也不能误删用户仍可续传的断点
        if (!this.#registry.isComplete()) {
            return;
        }
        /*
         * 要清的不止当前目录：换过目录后，仍在跑的任务的 `.part` 还钉在旧目录里，
         * 而那个目录里同样可能有上次被强杀留下的孤儿。故把「当前目录」与「活任务
         * 钉着的每个目录」并起来逐个清，各自带上该目录的存活集合
         */
        // 目录与各自的存活集合在**同一趟同步遍历**里算完：清理要过好几趟桥，
        // 期间队列会变；「目录取一次快照、keep-list 每轮重算」是两份不同时刻的真相
        const plan = new Map<string, string[]>([
            [resolveDownloadDir(this.#config), []],
        ]);
        for (const record of this.#registry.list()) {
            const transfer = record.transfer;
            if (!transfer) {
                continue;
            }
            const dir = this.#transferDirOf(transfer);
            const keys = plan.get(dir);
            if (keys) {
                keys.push(transfer.stagingKey);
            } else {
                plan.set(dir, [transfer.stagingKey]);
            }
        }
        for (const [dir, liveStagingKeys] of plan) {
            // 逐个兜住：某个目录列不出来（卷已拔出 / 权限被撤）不该让其余目录一趟都不清
            await downloadEngine
                .cleanupOrphans(dir, liveStagingKeys)
                .catch(() => undefined);
        }
    }

    /** 真正的启动流程；按端口契约**恒 resolve**，不把失败向上抛 */
    async #runSetup(): Promise<void> {
        if (!isDownloadEngineSupported) {
            return; // 平台无下载引擎（当前 iOS）：入口由 UI 侧隐藏，此处静默跳过
        }
        try {
            await downloadEngine.setup();
        } catch {
            return; // 引擎起不来就别继续碰它（尤其不能在初始化未定时删文件）；下次启动重试
        }
        // 先装订阅：对账期间原生就可能发事件，晚装会漏
        this.#scheduler.subscribe();
        try {
            this.#scheduler.watchLimits();
        } catch {
            // 装不上只是「改了并发上限或任务间隔要等下一轮调度才生效」，不该拖垮整个启动
        }
        // 闸门要在放行调度之前建好，否则冷启动瞬间会先在移动网络上抢跑一批
        try {
            await this.#scheduler.watchWifiGate();
        } catch {
            // 装不上闸门时网络归类保持「判不出来」，按与蜂窝同等对待处置：
            // 任务停在「等待 Wi-Fi」，用户仍可打开「使用移动网络下载」直接放行
        }
        try {
            // 认领仍在跑的任务，并把原生已不认的 downloading 退回排队
            await this.#scheduler.reconcile();
        } catch {
            // 对不上账就不放行调度：此时不知道原生还在跑几个，贸然 start 会超额并发
            return;
        }
        try {
            // 先补录未入账的完成，再算存活集合——否则已完成的任务还会被当成「在传输」
            await this.#completion.replayReceipts();
        } catch {
            // 重放失败：回执仍留在原生侧，下次启动再试
        }
        try {
            await this.#cleanupOrphans();
        } catch {
            // 清理是尽力而为：失败只是多占点空间，不该影响启动
        }
        this.#scheduler.activate();
    }
}

/** 已下载条目 → done 态下载记录 */
function toDoneRecord(entry: DownloadedEntry): DownloadRecord {
    return {
        item: entry.item,
        mediaKey: entry.mediaKey,
        state: 'done',
        path: entry.file.path,
        extension: entry.file.extension,
        sizeBytes: entry.file.sizeBytes,
        completedAt: entry.file.completedAt,
        resolvedQuality: entry.file.resolvedQuality,
    };
}

/** 单门 live-binding 裸对象；外部只经此引用，运行时依赖由 app/container 注入 */
export let download: IDownload;

export function provideDownload(instance: IDownload): void {
    download = instance;
}

/**
 * 本平台是否有下载引擎（iOS 暂无）
 * false 时入口应由 UI 隐藏——`setup()` 与各命令都会静默跳过，不会报错也不会有反馈
 */
export const isDownloadSupported = isDownloadEngineSupported;

// —— barrel：UX 与其他 core 只从这里取，不 deep import 两侧子目录 ——

export type {
    DownloadDeps,
    DownloadRecord,
    DownloadRecordState,
    IDownload,
    SetDownloadDirResult,
} from './types';

// 已下载库只导出 `DownloadedEntry`：入账契约那几个类型是模块内部的，
// 开在这里会让外部拿到一个无从产生的结果类型
export type { DownloadedEntry } from './downloaded/types';

export type {
    ActiveDownloadFilter,
    ActiveDownloadRecord,
    DownloadProgress,
    DownloadSummary,
    PendingDownloadPhase,
    TransferIdentity,
} from './transfer/types';

export { useDownloadedCount, useDownloadedList } from './downloaded/hooks';

export {
    useDownloadPendingPhase,
    useDownloadProgress,
    useDownloadSummary,
    useDownloadTasks,
} from './transfer/hooks';
