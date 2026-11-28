/**
 * 已完成文件的归档：写进本地音乐库 → 移出队列 → 确认原生回执
 *
 * 与 `scheduler` 分开的理由：归档与「何时发起传输」无关，且能在**没有调度的情况下独立运行**——
 * 启动时的回执重放就是这个场景：上一个进程已传输完成但没来得及入账，本进程只需补录，无需重传
 */
import { exists, stat } from '@dr.pogodin/react-native-fs';

import { downloadEngine } from '@/native/downloadEngine';

import type { KeyedLock } from './keyedLock';
import type { DownloadRegistry } from './registry';
import type {
    RecordDownloadedFileInput,
    RecordDownloadedFileResult,
} from '../downloaded/types';
import type { ILocalMusic } from '@/core/localMusic';
import type { CompletionReceipt } from '@/native/downloadEngine';

/** 写下载库：由 Download 注入（已下载库在另一侧），否则传输侧要反过来依赖它 */
type RecordDownloadedFile = (
    input: RecordDownloadedFileInput,
) => RecordDownloadedFileResult;

/**
 * 完成入账：把原生已发布的文件收进下载库与本地库，并让任务离开队列
 * 运行时的 `onComplete` 与启动时的回执重放走同一条路径——两者拿到的是同一份终态信息，
 * 差别只在「进程有没有活到入账那一刻」
 */
export class CompletionCommitter {
    readonly #registry: DownloadRegistry;
    readonly #localMusic: ILocalMusic;
    readonly #recordDownloadedFile: RecordDownloadedFile;
    readonly #lock: KeyedLock;

    constructor(deps: {
        registry: DownloadRegistry;
        localMusic: ILocalMusic;
        recordDownloadedFile: RecordDownloadedFile;
        lock: KeyedLock;
    }) {
        this.#registry = deps.registry;
        this.#localMusic = deps.localMusic;
        this.#recordDownloadedFile = deps.recordDownloadedFile;
        this.#lock = deps.lock;
    }

    /**
     * 补录原生已完成、但 JS 还没入账的下载
     * 传输走完到入账之间进程若被杀（后台被系统回收 / 崩溃），文件已发布而队列还以为它在下载；
     * 原生把终态落成回执等 JS 来取
     */
    async replayReceipts(): Promise<void> {
        const receipts = await downloadEngine.getUnackedCompletions();
        for (const receipt of receipts) {
            try {
                await this.commit(receipt);
            } catch {
                // 逐条隔离：一条持续失败不该让它后面的回执永远轮不上
            }
        }
    }

    /**
     * 落本地库 → 移出队列 → 确认回执
     * 顺序不可换：只有确认已入库才能移除队列与回执，否则进程再被杀就两头皆空、文件成孤儿
     */
    async commit(receipt: CompletionReceipt): Promise<void> {
        const owner = this.#registry.findByContentKey(receipt.contentKey);
        if (owner.kind === 'unknown') {
            return; // 队列视图不完整，判不出归属：留着回执，下次启动再说
        }
        if (owner.kind === 'absent') {
            // 任务已被取消 / 删除：文件留在下载目录，扫描会按其自带的 MF_MUSICITEM
            // 认回来源身份。回执不能一直堆着，直接确认掉
            downloadEngine.ackCompletion(receipt.taskId);
            return;
        }
        await this.#lock.run(owner.mediaKey, () =>
            this.#commitOwned(owner.mediaKey, receipt),
        );
    }

    /** 事务本体；已持有该歌的串行锁 */
    async #commitOwned(
        ownerKey: string,
        receipt: CompletionReceipt,
    ): Promise<void> {
        // 锁内重读：排队等锁期间用户可能已取消 / 重下这首歌，锁外那份快照可能已过期
        const record = this.#registry.get(ownerKey);
        if (record?.transfer?.contentKey !== receipt.contentKey) {
            // 归属已变（任务被取消或换了音质重下）：这份文件属于旧任务，不入账、也不动当前记录
            downloadEngine.ackCompletion(receipt.taskId);
            return;
        }
        const completedAt = await fileCompletedAt(receipt.path);
        if (completedAt === 'unreadable') {
            return; // 一时读不到（存储未挂载 / 权限）：留着回执重试，别登记一条指不到文件的记录
        }
        if (completedAt === 'missing') {
            downloadEngine.ackCompletion(receipt.taskId); // 文件已不在，没什么可入账的
            return;
        }
        const saved = this.#recordDownloadedFile({
            item: record.item,
            file: {
                path: receipt.path,
                extension: receipt.extension,
                sizeBytes: receipt.sizeBytes,
                completedAt,
                // 音质取交给原生时记下的实际命中档，不重算
                resolvedQuality: record.transfer.resolvedQuality,
            },
        });
        if (!saved) {
            return; // 没入库就不能 ack：回执留着，下次启动重试
        }
        // 同步进本地音乐库：下载好的歌应当立刻可见，而不是等到下次扫描
        // 失败不回滚下载入账——文件确实下好了，下次扫描会把它收进库
        this.#localMusic.addFile({
            item: record.item,
            path: receipt.path,
            sizeBytes: receipt.sizeBytes,
            addedAt: completedAt,
        });
        if (saved.supersededPath) {
            // 重下顶掉的旧文件。走 localMusic 而不是裸 unlink：删文件还要把它从本地库摘掉、
            // 清掉指向它的锚点——只删盘会在库里留一条指不到文件的记录，而且它体积可能更大，
            // 派生层选代表时反而会选中这条死路径
            // 仍在锁内 await：迟到的删除可能命中被新任务复用的同一路径
            await this.#localMusic
                .deleteFilesAt([saved.supersededPath])
                .catch(() => undefined); // 删不掉只是留个孤儿，不影响本次已完成的事实
        }
        if (!this.#registry.remove(ownerKey)) {
            return; // 队列没删干净就不能 ack：否则重启后旧任务复活，遮蔽已入库的完成记录
        }
        downloadEngine.ackCompletion(receipt.taskId);
    }
}

/**
 * 核验发布出来的文件并取完成时间
 * 时间取文件 mtime：回执可能是上次进程留下的，用「现在」会把几天前下好的歌排到下载页最前
 * 三态是为了把「文件已经不在了」和「这会儿读不到」分开——前者没什么可入账的，
 * 后者（存储未挂载 / 权限）只是暂时的，登记下去会留一条指不到文件的完成记录
 */
async function fileCompletedAt(
    path: string,
): Promise<number | 'missing' | 'unreadable'> {
    try {
        const mtime = (await stat(path)).mtime;
        const at = mtime instanceof Date ? mtime.getTime() : Number(mtime);
        // mtime 拿不到不代表文件有问题，此时用当前时间，排序略偏好过入账失败
        return Number.isSafeInteger(at) && at > 0 ? at : Date.now();
    } catch {
        return (await exists(path).catch(() => true))
            ? 'unreadable'
            : 'missing';
    }
}
