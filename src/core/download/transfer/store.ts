/**
 * 传输的运行时状态：供 React 观察的那一份
 *
 * 与 registry 的分工是「该不该活过进程」：registry 持久化「还没下完的任务」，
 * 本模块只放重启即弃的运行时数据——进度、闸门、以及活动队列的**只读镜像**。
 * 队列的权威副本始终在 registry；这里的镜像只为让界面能订阅到变化
 *
 * 发布与读取一律走 `uiMirror`：后台不写 atom、只压最新值，回前台一次刷入。
 * 后台批量下载时每个任务各一路进度 tick，直写会在不可见期间堆出大量 mount 指令。
 * 读改写（进度表按 key 覆盖）尤其要走 `readLatest`——从 atom 读会拿到过期底表，
 * 后台连写多个 key 时只有最后一个能活下来
 */
import { atom } from 'jotai';

import { publishToUi, readLatest } from '@/infra/uiMirror';

import type {
    ActiveDownloadFilter,
    ActiveDownloadRecord,
    DownloadProgress,
    DownloadSummary,
    PendingDownloadPhase,
} from './types';
import type { Atom } from 'jotai';

/**
 * 全部活动下载的进度，按 mediaKey 索引
 * 用一个 Map atom 而非一歌一 atom：并发上限只有个位数，整表替换的开销远小于维护 N 个 atom 的生命周期；
 * 行级重渲由列表行自己 memo 收敛
 */
const progressAtom = atom<ReadonlyMap<string, DownloadProgress>>(new Map());

/** 供 React 侧订阅（hooks 在 transfer/hooks 暴露，UX 不直接引用本模块） */
export const downloadProgressAtom = progressAtom;

/** 覆盖某首歌的进度（原生按 progressIntervalMs 节流，故此处不再限频） */
export function setDownloadProgress(
    mediaKey: string,
    progress: DownloadProgress,
): void {
    const next = new Map(readLatest(progressAtom));
    next.set(mediaKey, progress);
    publishToUi(progressAtom, next);
}

/** 任务离开活动态（完成 / 失败 / 取消）时清掉，避免 Map 只增不减 */
export function clearDownloadProgress(mediaKey: string): void {
    const current = readLatest(progressAtom);
    if (!current.has(mediaKey)) {
        return;
    }
    const next = new Map(current);
    next.delete(mediaKey);
    publishToUi(progressAtom, next);
}

/** 活动任务的只读镜像，按 mediaKey 索引；权威副本在 registry */
const activeAtom = atom<ReadonlyMap<string, ActiveDownloadRecord>>(new Map());

/** 供 React 侧订阅 */
export const activeDownloadsAtom = activeAtom;

/** 同一 tick 内待发布的快照来源；有值即表示已排好队 */
let pendingSource:
    | (() => ReadonlyMap<string, ActiveDownloadRecord>)
    | undefined;

/**
 * 通知活动队列已变更；**同一 tick 内的多次变更只发布一次**
 *
 * 批量入队会连续写数百上千条，若每条都立刻克隆一遍 Map 就是 O(N²)，
 * 还会在一帧里推出同样多次渲染。传入取快照的函数而非快照本身，
 * 就能把克隆推迟到真正发布的那一刻，中间态一次都不用构造
 */
export function publishActiveDownloads(
    snapshot: () => ReadonlyMap<string, ActiveDownloadRecord>,
): void {
    const scheduled = pendingSource !== undefined;
    pendingSource = snapshot;
    if (scheduled) return;
    queueMicrotask(() => {
        const take = pendingSource;
        pendingSource = undefined;
        if (take) publishToUi(activeAtom, take());
    });
}

/**
 * 「仅 Wi-Fi 下载」闸门当前是否拦着
 * 闸门是全局的——关上时**所有**排队任务都在等 Wi-Fi，没有一条例外。故用一个布尔值，
 * 而不是往每条记录里抄一份（那样闸门每变一次就要批量重写整个队列）
 */
const wifiGateBlocked = atom(false);

/** 供 React 侧订阅；真值由 `setup()` 建立闸门时确立，此前队列也还没放行 */
export const wifiGateBlockedAtom = wifiGateBlocked;

/** 闸门状态变更；重复写同一个值不会推渲染（Jotai 对原始值 atom 自带 `Object.is` 去重） */
export function setWifiGateBlocked(blocked: boolean): void {
    publishToUi(wifiGateBlocked, blocked);
}

/**
 * 已占并发槽、正在解析音源的任务
 * 它们在 registry 里还是 `pending`（解析出音源才转 `downloading`），但槽位已经占住，
 * 界面不能把它们说成排队——那正是「并发上限设了却看着像没生效」的由来
 */
const startingKeys = atom<ReadonlySet<string>>(new Set<string>());

/** 供 React 侧订阅 */
export const downloadStartingAtom = startingKeys;

/** 覆盖「发起中」集合；调用方传自己的实时集合，这里自行快照 */
export function publishDownloadStarting(keys: ReadonlySet<string>): void {
    publishToUi(startingKeys, new Set(keys));
}

/**
 * 正被任务间隔挡着的那一条；没有则 undefined
 * 只会有一条：间隔门控在调度泵的循环里，一次只挡住待发起的那一个
 */
const intervalHoldKey = atom<string | undefined>(undefined);

/** 供 React 侧订阅 */
export const downloadIntervalHoldAtom = intervalHoldKey;

/** 记下 / 清掉正在等间隔的那一条 */
export function setDownloadIntervalHold(mediaKey: string | undefined): void {
    publishToUi(intervalHoldKey, mediaKey);
}

/** 一条 `pending` 任务当下处在哪一步；对别的状态没有意义 */
export function pendingPhaseOf(
    mediaKey: string,
    context: {
        starting: ReadonlySet<string>;
        intervalHold: string | undefined;
        waitingForWifi: boolean;
    },
): PendingDownloadPhase {
    // 已经在解析音源的排在最前：它是这条任务当下真正在做的事，
    // 闸门此刻即便关上也要等解析回来才会把它退回排队
    if (context.starting.has(mediaKey)) return 'resolvingSource';
    if (context.waitingForWifi) return 'waitingWifi';
    if (context.intervalHold === mediaKey) return 'waitingInterval';
    return 'queued';
}

/**
 * 一条记录是否属于该筛选面
 * 「排队中」专指还没拿到并发槽的；闸门关着时排队项是「等待 Wi-Fi」，与发起中的一并归进行中
 */
function inFilter(
    record: ActiveDownloadRecord,
    filter: ActiveDownloadFilter,
    context: { starting: ReadonlySet<string>; waitingForWifi: boolean },
): boolean {
    switch (filter) {
        case 'inProgress':
            return (
                record.state === 'downloading' ||
                record.state === 'paused' ||
                (record.state === 'pending' &&
                    (context.waitingForWifi ||
                        context.starting.has(record.mediaKey)))
            );
        case 'queued':
            return (
                record.state === 'pending' &&
                !context.waitingForWifi &&
                !context.starting.has(record.mediaKey)
            );
        case 'failed':
            return record.state === 'failed';
    }
}

/**
 * 某个筛选面的任务列表
 *
 * 只收本面的再排序：页面一次只显示一个筛选面，为另外两组排序纯属白费。
 * **按消费者创建，不做成模块级常量**：模块级 atom 被模块永久引用，Jotai 会把它最后一次
 * 算出的数组一直留在 store 里；页面关掉之后，那份快照里已经离队的任务
 * （连同各自的 MusicItem）就再也释放不掉了
 *
 * 按入队时间排序——按状态排会让某一行状态一变就跳位置，列表的复用与用户的视线都跟着乱
 */
export function createDownloadTasksAtom(
    filter: ActiveDownloadFilter,
): Atom<readonly ActiveDownloadRecord[]> {
    return atom<readonly ActiveDownloadRecord[]>(get => {
        const active = get(activeAtom);
        const context = {
            starting: get(startingKeys),
            waitingForWifi: get(wifiGateBlocked),
        };
        const picked: ActiveDownloadRecord[] = [];
        for (const record of active.values()) {
            if (inFilter(record, filter, context)) picked.push(record);
        }
        return picked.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    });
}

/**
 * 摘要与分段筛选的角标计数
 * 只扫一遍计数、**完全不排序**；结果只有四个数字，不攥着任何记录，
 * 因此做成模块级共享也不会把已离队的任务留住
 */
export const downloadSummaryAtom = atom<DownloadSummary>(get => {
    const active = get(activeAtom);
    const waitingForWifi = get(wifiGateBlocked);
    const starting = get(startingKeys);
    let downloading = 0;
    let paused = 0;
    let pending = 0;
    // 已占槽、正在解析音源的那部分 pending：闸门没关时它们算进行中，不算排队
    let startingPending = 0;
    let failed = 0;
    for (const record of active.values()) {
        switch (record.state) {
            case 'downloading':
                downloading += 1;
                break;
            case 'paused':
                paused += 1;
                break;
            case 'pending':
                pending += 1;
                if (starting.has(record.mediaKey)) startingPending += 1;
                break;
            case 'failed':
                failed += 1;
                break;
        }
    }
    return {
        downloading,
        paused,
        inProgress:
            downloading + paused + (waitingForWifi ? pending : startingPending),
        queued: waitingForWifi ? 0 : pending - startingPending,
        failed,
    };
});
