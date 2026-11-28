/**
 * 传输调度与状态同步：决定「什么时候把哪条任务交给原生」，并把原生的回报翻译回队列状态
 *
 * 核心状态是 `#tasks`——**原生还持有哪些任务**。注意它与「占不占并发槽」不是一回事：
 * 任务暂停后 worker 已退出（不占槽，该让下一首开始下），但原生那边的任务登记、
 * 容量名额、路径占用与 `.part` 文件都还在。故用一张表 + `running` 标志分别表达：
 * 在表里 = 原生还持有（取消必须通知原生、事件还得能路由到它）；`running` 为真 = 才占槽
 *
 * 并发槽还有第二个占用方 `#starting`：解析音源期间原生手上什么都没有，但槽必须先占住，
 * 否则上限拦不住这一段，几条解析同时返回就会一起 start 出去
 *
 * 不负责文件完成后的归档（那是 `completion` 的职责）；收到 `onComplete` 后只释放传输槽位，
 * 再把事件交给注入的回调，不依赖归档逻辑
 */
import { getNetworkClass, onNetworkClassChange } from '@/infra/network';
import { delay, withTimeout } from '@/infra/timer';
import {
    DownloadConflictStrategy,
    downloadEngine,
    DownloadState,
    NotificationAction,
} from '@/native/downloadEngine';
import { encodeEmbeddedIdentity } from '@/utils/embeddedIdentity';
import { clamp } from '@/utils/number';

import { resolveDownloadDir } from '../downloadPath';

import { failureReasonOf } from './failure';
import { contentKeyOf, finalNameOf, stagingKeyOf } from './identity';
import { resolveDownloadSource } from './source';
import {
    clearDownloadProgress,
    publishDownloadStarting,
    setDownloadIntervalHold,
    setDownloadProgress,
    setWifiGateBlocked,
} from './store';

import type { DownloadFailureReason } from './failure';
import type { KeyedLock } from './keyedLock';
import type { DownloadRegistry } from './registry';
import type { ActiveDownloadRecord, ActiveDownloadState } from './types';
import type { IConfig } from '@/core/config';
import type { IPluginManager } from '@/core/plugin';
import type { NetworkClass } from '@/infra/network';
import type { DownloadCompleteEvent } from '@/native/downloadEngine';
import type { MusicItem } from '@/types';

/** 并发上限的合法区间：下限 1（0 等于永不下载），上限对齐原生线程池 */
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 6;

/**
 * 单条任务的源解析总预算（毫秒）
 * 插件是第三方 JS，一个永不 settle 的 Promise 会把调度泵卡死、整个队列停摆
 */
const RESOLVE_TIMEOUT_MS = 30000;

/**
 * 一条原生仍持有的任务：把事件里的 taskId 映射回队列身份，并据 attemptId 丢掉迟到事件
 * 条目存在 = 原生还持有（含已暂停）；只有完成 / 失败 / 取消这些真终态才移除
 */
interface NativeTask {
    readonly mediaKey: string;
    /** 本次网络执行代次；只认最新一代的事件 */
    attemptId: number;
    /** worker 是否在跑；决定占不占并发槽。暂停后为 false，但原生仍持有该任务 */
    running: boolean;
    /**
     * 用户已经按下暂停，正等 worker 退出
     * worker 退出要经历断开连接、收尾、事件回桥，慢网下能拖上数秒；
     * 这段时间 Wi-Fi 闸门若正好关上，不记下意图就会把用户的暂停改写成「等 Wi-Fi」，
     * 网络一回来又自己续上了
     */
    userPausing: boolean;
}

/**
 * 传输调度：决定「什么时候把哪条任务交给原生」，并把原生事件翻译回队列状态
 * 与完成入账分开——那是「文件到手之后怎么归档」，与调度何时发起无关
 */
export class Scheduler {
    readonly #registry: DownloadRegistry;
    readonly #config: IConfig;
    readonly #plugins: IPluginManager;
    readonly #lock: KeyedLock;
    /** 传输完成后的归档动作，由 Download 注入（调度不关心归档细节） */
    readonly #onCompleted: (event: DownloadCompleteEvent) => void;
    /**
     * 原生仍持有的任务，按 taskId 索引
     * 只存内存：进程重启后由 `getActiveTasks()` 与 registry 对账重建
     */
    readonly #tasks = new Map<string, NativeTask>();
    /**
     * 正在发起的任务，按 mediaKey 索引：已占并发槽，但还在解析音源 / 等原生受理
     * 与 `#tasks` 分开——那张表要等解析出 contentKey 才建得起来，而槽位从发起那一刻就得占住
     */
    readonly #starting = new Set<string>();
    /** 单调递增的执行代次；同进程内唯一即可（原生只用它比对新旧） */
    #attemptSeq = 0;
    /**
     * 最近几次发起传输的时刻，只留最近 `MAX_CONCURRENCY` 次，再早的永远用不上
     *
     * `downloadInterval` 在这里的口径是**发起速率**：任意 interval 长的窗口内最多发起 limit 次，
     * 故只需回看第 limit 次之前那一发。并发为 1 时它退化成「相邻两次发起的最小间隔」
     *
     * 计时点是「把任务交给发起流水线」那一刻，不是原生真正发出 GET 的时刻——
     * 解析音源本身也在打源站，等它成功才计时等于没节流
     */
    readonly #recentStarts: number[] = [];
    /** 正在进行的那次间隔等待；队列或限额一变就中断它，按新情况重判 */
    #intervalWait: AbortController | undefined;
    /** 调度泵是否正在跑；泵是单飞的，重复触发只做标记 */
    #pumping = false;
    /** 泵在跑期间又被触发过：它可能已越过相关判断，收尾时补跑一轮 */
    #pumpAgain = false;
    /** 对账完成前不放行调度：此时不知道原生还在跑几个，贸然 start 会超额并发 */
    #ready = false;
    /**
     * 当前网络归类；启动时读一次，之后由订阅更新
     * 初值是 `unknown` 而非 `nonCellular`：闸门装好之前宁可先拦着，不能先放行
     */
    #network: NetworkClass = 'unknown';

    constructor(deps: {
        registry: DownloadRegistry;
        config: IConfig;
        plugins: IPluginManager;
        lock: KeyedLock;
        onCompleted: (event: DownloadCompleteEvent) => void;
    }) {
        this.#registry = deps.registry;
        this.#config = deps.config;
        this.#plugins = deps.plugins;
        this.#lock = deps.lock;
        this.#onCompleted = deps.onCompleted;
    }

    /** 订阅原生事件；只在启动时装一次 */
    subscribe(): void {
        downloadEngine.onBegin(e => {
            const key = this.#liveMediaKey(e.taskId, e.attemptId);
            if (!key) return;
            setDownloadProgress(key, {
                downloadedBytes: 0,
                totalBytes: e.totalBytes,
            });
        });
        downloadEngine.onProgress(e => {
            const key = this.#liveMediaKey(e.taskId, e.attemptId);
            if (!key) return;
            setDownloadProgress(key, {
                downloadedBytes: e.downloadedBytes,
                totalBytes: e.totalBytes,
            });
        });
        downloadEngine.onComplete(e => {
            const key = this.#liveMediaKey(e.taskId, e.attemptId);
            if (!key) return;
            this.#tasks.delete(e.taskId); // 真终态：原生已放手
            clearDownloadProgress(key);
            // 先补槽再归档：归档要 stat 文件、写 MMKV、删旧文件，慢存储上能拖很久，
            // 这段时间不该让空出来的传输槽干等着
            this.pump();
            this.#onCompleted(e);
        });
        downloadEngine.onError(e => {
            this.#abortTask(e.taskId, e.attemptId, key =>
                this.#markFailed(key, failureReasonOf(e.code)),
            );
        });
        downloadEngine.onCanceled(e => {
            this.#abortTask(e.taskId, e.attemptId, key => {
                clearDownloadProgress(key);
                this.#registry.remove(key); // 取消不是记录态：取消即离队
            });
        });
        downloadEngine.onPaused(e => {
            // worker 已退出、任务静止，`.part` 保留可续（主动暂停与服务超时暂停均走此事件）
            // **不是终态**：原生仍持有该任务，条目必须留着，否则随后真正的
            // onCanceled 会因查不到归属而被丢弃，原生已取消而 JS 还显示已暂停
            const key = this.#liveMediaKey(e.taskId, e.attemptId);
            if (!key) return;
            const task = this.#tasks.get(e.taskId);
            if (task) {
                task.running = false; // 让出传输槽，但保留原生所有权
            }
            // 用户按暂停时 worker 还在跑，就只能等这个事件来落库。
            // 而 Wi-Fi 闸门可能已抢先把它退回了排队（闸门只避让**已经**记下意图的），
            // 那时不认 `pending` 就会把用户的暂停吃掉——网络一回来它自己又续上了
            const userPausing = task?.userPausing === true;
            clearDownloadProgress(key);
            this.#lock
                .run(key, () => {
                    const record = this.#registry.get(key);
                    // 只改「还在下载中」的（外加上面那种用户已按下暂停的排队态）：
                    // 别的状态说明已经有人给它定了别的去处（如用户已取消），不能拿暂停盖掉
                    if (
                        record?.transfer?.contentKey === e.taskId &&
                        (record.state === 'downloading' ||
                            (userPausing && record.state === 'pending'))
                    ) {
                        this.#registry.put({ ...record, state: 'paused' });
                    }
                    return Promise.resolve();
                })
                .catch(() => undefined)
                .finally(() => this.pump()); // 让下一首顶上腾出来的槽
        });
        downloadEngine.onNotificationAction(e => {
            // 通知按钮只是另一个入口，转调同一组命令，不另造一套状态机
            if (e.action === NotificationAction.PauseAll) {
                this.pauseAll();
            } else if (e.action === NotificationAction.CancelAll) {
                this.cancelAll();
            }
        });
    }

    /**
     * 与原生对账，重建任务表
     * 两种情形：①JS 侧重载（开发期热重载）——原生任务还在跑，不认领的话它们的事件会被
     * 当迟到丢弃、任务卡死；②进程完整重启——原生活动表是空的，而队列里还记着
     * `downloading`，调度泵只取 `pending`，不退回排队这些任务就永远不会再动
     */
    async reconcile(): Promise<void> {
        const active = await downloadEngine.getActiveTasks();
        const adopted = new Map<string, boolean>(); // mediaKey → worker 是否仍在跑
        for (const task of active) {
            const owner = this.#registry.findByContentKey(task.taskId);
            if (owner.kind !== 'found') {
                continue; // 原生在跑但队列里没有：留给孤儿清理与回执重放收拾
            }
            // 只有真止住的（Paused）不占传输槽；Pausing 的 worker 还在跑、稍后会发 onPaused。
            // 两者都必须登记：原生仍持有任务，取消得发指令，事件也得能路由回来
            const running = task.state !== DownloadState.Paused;
            adopted.set(owner.mediaKey, running);
            this.#tasks.set(task.taskId, {
                mediaKey: owner.mediaKey,
                attemptId: task.attemptId,
                running,
                userPausing: false, // 意图只活在内存，重启后无从得知，不假装知道
            });
            // 代次不能倒退：JS 重载后本地序列从 0 起，撞上原生仍在用的旧代次会认错事件
            if (
                Number.isSafeInteger(task.attemptId) &&
                task.attemptId > this.#attemptSeq
            ) {
                this.#attemptSeq = task.attemptId;
            }
        }
        for (const record of this.#registry.list()) {
            if (record.state !== 'downloading') continue;
            const running = adopted.get(record.mediaKey);
            if (running === undefined) {
                // 原生已经不认这条了（进程重启 / 被系统清掉）：退回排队重下，
                // 已下的 `.part` 会被续传复用，不算白下
                this.#registry.put({ ...record, state: 'pending' });
            } else if (!running) {
                // 原生认得，但已经停住了（例如前台服务超时暂停后 JS 没能落库）：
                // 状态不拉齐的话这条会卡在「下载中」，暂停和继续都点不动
                this.#registry.put({ ...record, state: 'paused' });
            }
        }
    }

    /** 对账完毕，放行调度 */
    activate(): void {
        this.#ready = true;
        // 不直接 pump：JS 重载时原生可能正在移动网络上传输，对账认领后要按闸门重判一次
        this.#syncWifiGate();
    }

    /**
     * 跟踪并发上限与任务间隔：放宽后立刻补槽，不必等当前这批下完、也不必等满按旧值算出的间隔
     *
     * 两个值本身由 `#drain` 每轮现读，这里只负责把泵叫起来（泵若正卡在间隔等待上会被一并叫醒）。
     * 调紧不在此处理：已交给原生的任务不腰斩，队列随它们完成自然收敛
     */
    watchLimits(): void {
        this.#config.subscribe(
            ['basic.maxDownload', 'basic.downloadInterval'],
            () => this.pump(),
        );
    }

    /**
     * 开始跟踪「仅 Wi-Fi 下载」闸门：订阅两个输入，再读一次当前网络
     *
     * 初次读取必须在放行调度**之前**完成，否则冷启动那一瞬间会先在移动网络上抢跑一批。
     * 两处顺序都是有意的：
     * - **开关订阅先装**，且不因后面失败而撤：网络监听装不上时，用户至少还能靠
     *   打开「使用移动网络下载」自己放行，不至于队列卡死又没人能解
     * - **网络监听先于读取**：读到的值必须有东西持续更新它，否则就是一张会过期的快照。
     *   任一步抛出时 `#network` 停在 `unknown`，按「判不出来就拦着」处置
     */
    async watchWifiGate(): Promise<void> {
        this.#config.subscribe(['basic.useCelluarNetworkDownload'], () =>
            this.#syncWifiGate(),
        );
        onNetworkClassChange(next => {
            this.#network = next;
            this.#syncWifiGate();
        });
        this.#network = await getNetworkClass();
        // 只同步给界面，不在此触发调度：此刻还没与原生对账，动队列会打乱 reconcile 的判断
        setWifiGateBlocked(this.#blockedByWifiGate());
    }

    /**
     * 是否被「仅 Wi-Fi 下载」拦着
     * `unknown` 与 `cellular` 同等对待：判不出网络时放行等于把用户的流量赌进去，
     * 而拦下的代价只是等一会儿——界面会显示「等待 Wi-Fi」，用户还能靠打开开关直接放行
     */
    #blockedByWifiGate(): boolean {
        if (this.#config.get('basic.useCelluarNetworkDownload')) return false;
        return this.#network !== 'nonCellular';
    }

    /** 闸门两个输入（网络、开关）之一变了：关上就停手等 Wi-Fi，打开就继续 */
    #syncWifiGate(): void {
        const blocked = this.#blockedByWifiGate();
        setWifiGateBlocked(blocked); // 界面据此把排队项显示成「等待 Wi-Fi」还是「排队中」
        if (blocked) {
            this.#holdForWifi();
        } else {
            this.pump();
        }
    }

    /**
     * 把正在传输的退回排队并请原生停下，`.part` 保留待续
     *
     * 退回 `pending` 而非 `paused`：等 Wi-Fi 不是用户的暂停意图，Wi-Fi 一回来就该自动接上，
     * 而 `paused` 必须留给用户亲手按下的那一次（否则手动暂停的歌会被闸门顺手恢复）。
     * 这样「等待 Wi-Fi」天然就是设计稿说的 `PENDING` 变体，不必新增持久化状态，
     * 重启后也不需要额外账本才知道该恢复谁
     *
     * 先落库再发指令：随后到达的 `onPaused` 只改「还在 downloading」的记录，
     * 看到这里已经写成 `pending` 就不会把它按成暂停
     */
    #holdForWifi(): void {
        for (const record of this.#registry.list()) {
            if (record.state !== 'downloading' || !record.transfer) continue;
            const contentKey = record.transfer.contentKey;
            // 用户已经按过暂停、只是还没等到 worker 退出：那是他的意图，闸门不许抢改
            if (this.#tasks.get(contentKey)?.userPausing) continue;
            // 落不了库就别停：停了却仍记着 downloading，`onPaused` 会把它按成暂停，
            // 于是 Wi-Fi 回来也不会自动接上
            if (!this.#registry.put({ ...record, state: 'pending' })) continue;
            downloadEngine.pause(contentKey).catch(() => undefined);
        }
    }

    /**
     * 暂停：worker 真在跑的只发指令，状态等 `onPaused`——那时它才真退出、可安全续传；
     * worker 没在跑的（从没交出去、或已经停住正等着续传）没什么可等，就地改
     *
     * 已知缺口：传输身份落库到原生受理之间有一个桥往返的窗口，此时的指令原生认不得
     * 会落空。代价只是“没反应、再点一下”，不会造出状态谎言，故不为它引入意图栈
     */
    pause(key: string): void {
        if (this.#pause(key)) {
            this.pump(); // 队列变了：正等间隔的若是它，得让泵改挑别人
        }
    }

    /**
     * 暂停的实现；返回是否**就地改了队列状态**（调用方据此决定要不要重判调度）
     * 单独抽出是为了 `pauseAll`：在它的循环中途泵一下，会把还没轮到暂停的那些立刻发起出去
     */
    #pause(key: string): boolean {
        const record = this.#registry.get(key);
        if (!record) return false;
        if (this.#workerOf(record)) {
            const contentKey = record.transfer!.contentKey;
            // 先记下意图：worker 退出要经历断连接、收尾、事件回桥，慢网下能拖上数秒，
            // 不标记的话这段时间里 Wi-Fi 闸门一关就会把它改写成「等 Wi-Fi」并自动续上
            const task = this.#tasks.get(contentKey);
            if (task) {
                task.userPausing = true;
            }
            downloadEngine.pause(contentKey).catch(() => undefined);
            return false; // 状态等 onPaused 才改，那时它自己会泵
        }
        // 排队中，或已暂停但正等着续传的音源解析——后者若也去发指令，原生只会当空操作
        // 忽略（它已是暂停相位），解析回来后照样把任务续上，用户的暂停就被吃掉了
        if (record.state === 'pending') {
            return this.#registry.put({ ...record, state: 'paused' });
        }
        return false;
    }

    /** 继续：退回排队，由调度重新发起（已下的字节由原生按 `.part` 续传复用） */
    resume(key: string): void {
        this.#requeue(key, 'paused');
    }

    /** 重试：失败的重新排队。与「继续」同一条路径，差别只在允许的来源状态与界面措辞 */
    retry(key: string): void {
        this.#requeue(key, 'failed');
    }

    /**
     * 取消：worker 真在跑的只发指令，**等 `onCanceled` 才离队**——这期间传输随时可能完成，
     * 记录还得留着给完成事件认领
     * worker 没在跑就不会再有完成事件，可以立刻离队；但原生若仍持有该任务，
     * 必须同时请它放手，否则盘上的 `.part`、容量名额与路径占用会永久无人认领
     */
    cancel(key: string): void {
        const record = this.#registry.get(key);
        if (!record) return;
        if (this.#workerOf(record)) {
            downloadEngine
                .cancel(record.transfer!.contentKey)
                .catch(() => undefined);
            return;
        }
        const contentKey = record.transfer?.contentKey;
        if (contentKey !== undefined && this.#tasks.has(contentKey)) {
            downloadEngine.cancel(contentKey).catch(() => undefined);
            // 表项留给 `onCanceled` 收：这里删了它，那条事件就成了孤儿
        }
        this.#registry.remove(key);
        clearDownloadProgress(key);
        this.pump();
    }

    /** 这条记录名下是否有正在跑的 worker（占着传输槽、随时可能报完成） */
    #workerOf(record: ActiveDownloadRecord): boolean {
        const contentKey = record.transfer?.contentKey;
        return (
            contentKey !== undefined &&
            this.#tasks.get(contentKey)?.running === true
        );
    }

    /**
     * 全部暂停：正在传输的与排队中的都停下
     *
     * 设计稿写的是「不影响排队任务」，但只停传输中的话，空出来的槽会被排队任务立刻填上，
     * 「全部暂停」等于没暂停。故排队任务同样落到暂停态——它们由「全部继续」一并放回队列
     */
    pauseAll(): void {
        let changed = false;
        for (const record of this.#registry.list()) {
            if (record.state === 'downloading' || record.state === 'pending') {
                // 循环中途不泵：那会把还没轮到暂停的排队任务立刻发起出去
                changed = this.#pause(record.mediaKey) || changed;
            }
        }
        if (changed) {
            this.pump();
        }
    }

    /** 全部继续：暂停的一并放回队列，仍受并发上限与下载间隔约束 */
    resumeAll(): void {
        for (const record of this.#registry.list()) {
            if (record.state === 'paused') {
                this.resume(record.mediaKey);
            }
        }
    }

    /** 取消全部：清空整个队列 */
    cancelAll(): void {
        for (const record of this.#registry.list()) {
            this.cancel(record.mediaKey);
        }
    }

    /**
     * 触发调度：把 pending 任务在并发与间隔允许的范围内交给原生
     * 单飞——重复触发不并行跑两个泵，只记下标记让当前这轮收尾后再看一遍队列
     */
    pump(): void {
        if (!this.#ready) {
            return;
        }
        if (this.#pumping) {
            // 当前这轮可能已经越过了触发者关心的那个判断（比如刚数完在跑数就有任务完成），
            // 不记下来这次触发就白丢了，空出来的槽要等下一个事件才有人填
            this.#pumpAgain = true;
            // 卡在间隔等待上的话还得叫醒它：队列或配置可能已经变了（用户取消了正等着的那条、
            // 或调宽了限额），揣着旧判断睡下去最多能睡满一个间隔。
            // 叫醒不等于放行——回到循环顶上仍按 `#recentStarts` 重算剩余时间，绕不过节流
            this.#intervalWait?.abort();
            return;
        }
        this.#pumping = true;
        this.#drain()
            .catch(() => undefined) // 泵不能因为一次异常就永久停摆
            .finally(() => {
                this.#pumping = false;
                if (this.#pumpAgain) {
                    this.#pumpAgain = false;
                    this.pump();
                }
            });
    }

    /**
     * 标记失败并让出传输槽；失败态留在队列里，等用户决定重试还是删掉
     * 本方法**不自己加锁**，依赖调用方已在该歌的串行锁上，故不得外露
     */
    #markFailed(key: string, failure: DownloadFailureReason): void {
        const record = this.#registry.get(key);
        if (record) {
            this.#registry.put({ ...record, state: 'failed', failure });
        }
        clearDownloadProgress(key);
    }

    /** 放回队列：继续与重试的共同实现，只有允许的来源状态不同 */
    #requeue(key: string, from: ActiveDownloadState): void {
        const record = this.#registry.get(key);
        if (record?.state !== from) return;
        // 不清的话，重试中的任务还挂着上一次的失败原因
        const next = { ...record, state: 'pending' as const };
        delete next.failure;
        if (this.#registry.put(next)) {
            this.pump();
        }
    }

    async #drain(): Promise<void> {
        for (;;) {
            // 闸门在循环顶上判：等待下载间隔期间网络也可能已经变了
            if (this.#blockedByWifiGate()) {
                return; // 任务留在 pending 等 Wi-Fi，闸门重新打开时由 #syncWifiGate 唤醒
            }
            // 配置来自 MMKV，可能缺失或是脏数据；非整数归下限，而不是变成「永不下载」。
            // 必须整数：小数会让下面的窗口索引落到不存在的属性上，间隔门控整个失效
            const configured = this.#config.get('basic.maxDownload');
            const limit = clamp(
                typeof configured === 'number' && Number.isInteger(configured)
                    ? configured
                    : MIN_CONCURRENCY,
                MIN_CONCURRENCY,
                MAX_CONCURRENCY,
            );
            // 在跑的与正在发起的都占槽：解析音源期间原生手上还没有东西，但槽必须先占住，
            // 否则几条解析同时返回会一起 start 出去，直接冲破上限
            // （暂停的任务原生仍持有，但 worker 已退出，不该继续占着槽）
            let busy = this.#starting.size;
            for (const task of this.#tasks.values()) {
                if (task.running) busy += 1;
            }
            if (busy >= limit) {
                return;
            }
            const next = this.#nextPending();
            if (!next) {
                return;
            }
            // 间隔门控：任意 interval 长的窗口内最多发起 limit 次，故回看第 limit 次之前那一发；
            // 累计发起还不足 limit 次（冷启动、或刚调高上限）时没什么可等的
            const interval = this.#config.get('basic.downloadInterval') ?? 0;
            const now = Date.now();
            const windowStart =
                this.#recentStarts[this.#recentStarts.length - limit];
            if (windowStart !== undefined && windowStart > now) {
                // 系统时钟往回跳了：历史里的发起时刻落到「未来」，据它算出的等待毫无意义
                // （不作废的话每轮都会重新算出一段正等待，能把队列冻上跟跳变一样久），
                // 整段作废重来，代价只是这一瞬间不受间隔约束
                this.#recentStarts.length = 0;
            } else if (
                windowStart !== undefined &&
                windowStart + interval > now
            ) {
                // 让界面知道这一条是被间隔挡着，而不是在排队等槽位
                setDownloadIntervalHold(next.mediaKey);
                try {
                    await this.#waitInterval(windowStart + interval - now);
                } finally {
                    setDownloadIntervalHold(undefined);
                }
                continue; // 等待期间并发上限与任务状态都可能变了，回到顶上重新判
            }
            this.#beginTransfer(next.mediaKey);
        }
    }

    /** 等够间隔；队列或限额一变就由 `pump` 提前叫醒，好按新情况重判 */
    async #waitInterval(ms: number): Promise<void> {
        const controller = new AbortController();
        this.#intervalWait = controller;
        try {
            await delay(ms, {
                runInBackground: true,
                signal: controller.signal,
            });
        } catch (error) {
            // 被叫醒是预期的，回到循环顶上按新情况重判即可。
            // 别的失败（如原生计时器起不来）不能吞：等待时长不变，吞了就会立刻再等一次、
            // 再立刻失败，把泵变成一个烧 CPU 的死循环。抛出去由 pump 的兜底结束本轮
            if ((error as Error | undefined)?.name !== 'AbortError') {
                throw error;
            }
        } finally {
            this.#intervalWait = undefined;
        }
    }

    /**
     * 发起一条传输：占住并发槽后交给串行锁去解析音源并 start，**不等它完成**
     *
     * 解析要打源站，慢时能拖上数十秒。若在泵的循环里等它，任意时刻就只有一条任务在推进，
     * 并发上限形同虚设（一首歌常常在下一首解析完之前就传完了，表现即一个一个下）。
     * 故这里只占槽后就返回，让泵继续把剩下的槽填满
     */
    #beginTransfer(key: string): void {
        this.#setStarting(key, true);
        // 记在「发起」这一刻：解析本身也在打源站，等它成功才计时等于没节流
        this.#recentStarts.push(Date.now());
        if (this.#recentStarts.length > MAX_CONCURRENCY) {
            this.#recentStarts.shift();
        }
        this.#lock
            .run(key, () => this.#startTransfer(key))
            .catch(() => false) // 抛出等同「没推进」，按下面的口径处置
            .then(advanced => {
                // 兜住所有未走到「交接给 #tasks」那一步的退出路径（被取消、无源、落库失败等）；
                // 已交接过的这里是空操作。先让出槽再泵：顺序反了泵会以为槽还占着，直接空转返回
                this.#setStarting(key, false);
                // 没推进的（例如队列写不进去）不再泵：这条还停在 pending，
                // 再泵只会反复选中它空转，等下次事件或入队再来
                if (advanced) {
                    this.pump();
                }
            })
            .catch(() => undefined); // 上面只做同步记账，兜住以免变成未处理拒绝
    }

    /**
     * 增删「发起中」并同步给界面
     * 这些任务在库里还是 `pending`，界面不靠这份集合就只能把它们说成排队
     */
    #setStarting(key: string, starting: boolean): void {
        if (starting) {
            this.#starting.add(key);
        } else if (!this.#starting.delete(key)) {
            return; // 早已交接给 #tasks，不必再发一次快照
        }
        publishDownloadStarting(this.#starting);
    }

    /**
     * 取下一条待下载：按入队时间先来先下
     * 不能直接拿 `list()` 的第一条——那是 MMKV 的 key 顺序，重启后与用户的入队顺序无关
     */
    #nextPending(): ActiveDownloadRecord | undefined {
        let best: ActiveDownloadRecord | undefined;
        for (const record of this.#registry.list()) {
            if (record.state !== 'pending') continue;
            // 已经在发起了：状态要等音源解析回来才转 downloading，不跳过就会被反复选中
            if (this.#starting.has(record.mediaKey)) continue;
            // 名下还有在跑的 worker：Wi-Fi 闸门刚把它退回排队、但原生还没停住。
            // 此时抢着 start 会被原生以「相位仍是 Pausing」拒绝，反而把任务标成失败；
            // 等 `onPaused` 确认 worker 退出后会再泵一次，不会漏掉
            if (this.#workerOf(record)) continue;
            if (!best || record.enqueuedAt < best.enqueuedAt) {
                best = record;
            }
        }
        return best;
    }

    /**
     * 解析音源 → 落传输身份 → 交给原生；已持有该歌的串行锁
     * 返回是否推进了状态：false 表示这条还停在 pending，调用方须停止本轮以免空转
     */
    async #startTransfer(key: string): Promise<boolean> {
        const record = this.#registry.get(key);
        if (record?.state !== 'pending') {
            return true; // 等锁期间已被取消 / 已经在跑了：本条无需处理，可以继续看下一条
        }
        const plugin = this.#plugins.getByMediaItem(record.item);
        // 源解析的超时归调度（source.ts 明确把它交给这里）：插件是第三方 JS，
        // 一个永不 settle 的 Promise 会把泵永久卡住，进而让整个队列停摆
        const source = plugin
            ? await withTimeout(
                  resolveDownloadSource(
                      plugin,
                      record.item,
                      record.requestedQuality,
                      this.#config.get('basic.downloadQualityOrder') ?? 'asc',
                  ),
                  RESOLVE_TIMEOUT_MS,
              ).catch(() => null)
            : null;
        // 解析可能耗时数十秒，期间用户完全可能暂停或取消——那些命令不走本歌的串行锁
        // （否则一次卡住的解析会让所有按钮失灵）。拿解析前的旧快照往下走会把任务复活，
        // 故此处重读：状态变了或已被取消后重新入队（入队时间不同）都就此打住
        const fresh = this.#registry.get(key);
        if (
            fresh?.state !== 'pending' ||
            fresh.enqueuedAt !== record.enqueuedAt
        ) {
            return true;
        }
        // 同理，解析期间网络也可能已经切到移动网络。这条当时还是 `pending`，
        // 不在 `#holdForWifi` 的扫描范围里，不在这里重判就会直接绕过闸门跑到原生
        if (this.#blockedByWifiGate()) {
            return true; // 留在 pending 等 Wi-Fi
        }
        if (!source) {
            // 插件没给出可下载地址（含解析超时）：对用户与「服务器返回的不是音频」同一回事
            this.#markFailed(key, 'sourceUnavailable');
            return true;
        }
        const contentKey = contentKeyOf(fresh.item, source.resolvedQuality);
        // 音质回退可能让这次解析落到与上次不同的音质，contentKey 随之改变。
        // 旧任务在原生那边还占着容量名额、路径与 `.part`，没人再认领，必须先请原生放手；
        // 表项留给 `onCanceled` 收（那时记录已换成新身份，锁内校验会自行跳过改状态）
        const stale = fresh.transfer?.contentKey;
        if (stale !== undefined && stale !== contentKey) {
            downloadEngine.cancel(stale).catch(() => undefined);
        }
        const transfer = {
            resolvedQuality: source.resolvedQuality,
            contentKey,
            stagingKey: stagingKeyOf(contentKey),
            /*
             * 落盘目录钉在传输身份上，不是每次现读配置：`.part` 已经躺在当初那个目录里，
             * 续传换目录等于让原生以另一条路径重开、断点白下。字节身份没变（同一个
             * contentKey ⇒ 同一个 `.part`）就沿用记下的那个目录；身份变了（音质回退落到
             * 另一档）上面已请原生放手，这一趟是全新的传输，用现在的目录
             */
            destDir:
                stale === contentKey && fresh.transfer?.destDir !== undefined
                    ? fresh.transfer.destDir
                    : resolveDownloadDir(this.#config),
        };
        // 先落传输身份再 start：反过来若此刻进程被杀，盘上的 `.part` 就没人认领，
        // 下次启动会被当孤儿删掉，用户的断点白下
        if (!this.#registry.put({ ...fresh, state: 'downloading', transfer })) {
            return false; // 落不了库就不发起传输，免得出现原生在跑而 JS 不认的任务
        }
        // 代次由 JS 分配并**在 start 之前**登记：原生是先提交 worker 再 resolve Promise，
        // 小文件或立即失败会让 onBegin / onError / onComplete 早于受理确认到达，
        // 那时若任务表还没这一项，事件会被当迟到丢弃，任务就此卡死
        const resuming = this.#tasks.has(contentKey); // 原生已持有此任务 → 本次是续传而非新建
        this.#attemptSeq += 1;
        const attemptId = this.#attemptSeq;
        this.#tasks.set(contentKey, {
            mediaKey: key,
            attemptId,
            running: true,
            userPausing: false,
        });
        // 槽位就此从「发起中」交接给「在跑」：受理确认要走一个桥往返才回来，
        // 这段时间两边都记着的话同一条会被数两次，白占一个并发槽
        this.#setStarting(key, false);
        try {
            await downloadEngine.start({
                taskId: contentKey,
                attemptId,
                contentKey,
                url: source.url,
                headers: source.headers,
                // 取传输身份上钉住的那个目录，不是现在的配置：换目录只对此后新开的
                // 传输生效，这一条要回到自己 `.part` 所在的目录续传
                destDir: transfer.destDir,
                stagingKey: transfer.stagingKey,
                finalName: finalNameOf(fresh.item as MusicItem),
                // 不同的歌可能重名（`标题 - 艺术家` 撞车），改名避让好过互相覆盖或直接失败
                conflictStrategy: DownloadConflictStrategy.Rename,
                tags: this.#buildTags(fresh),
            });
        } catch {
            // 只撤销自己这一代的登记，别误删期间已换代的新传输
            const mine = this.#tasks.get(contentKey)?.attemptId === attemptId;
            if (mine && resuming) {
                // 续传被拒不代表原生放了手（如前台服务拉不起时它会回滚回暂停相位，
                // 仍揢着容量名额、路径与 `.part`）：抹掉表项会让后续的取消不再通知原生
                this.#tasks.set(contentKey, {
                    mediaKey: key,
                    attemptId,
                    running: false,
                    userPausing: false,
                });
            } else if (mine) {
                this.#tasks.delete(contentKey); // 新建受理失败，原生已完整回滚
            }
            // 原生受理失败（前台服务拉不起、入参被拒等）：用户无从下手，只能重试
            this.#markFailed(key, 'unknown');
        }
        return true;
    }

    /** 内嵌 tag：标准字段 + 自描述身份声明（让文件离开本机也能被认回来源） */
    #buildTags(record: ActiveDownloadRecord) {
        const fields: Record<string, string[]> = {};
        const put = (name: string, value: unknown) => {
            if (typeof value === 'string' && value.trim()) {
                fields[name] = [value];
            }
        };
        put('TITLE', record.item.title);
        put('ARTIST', record.item.artist);
        put('ALBUM', record.item.album);
        const declaration = encodeEmbeddedIdentity(record.item);
        if (declaration) {
            fields.MF_MUSICITEM = [declaration];
        }
        const coverUrl =
            typeof record.item.artwork === 'string'
                ? record.item.artwork
                : undefined;
        return { fields, ...(coverUrl ? { coverUrl } : {}) };
    }

    /**
     * 未完成而终结（失败 / 取消）的公共收尾：丢迟到事件 → 原生放手 → 持锁改状态 → 补位
     * 状态变更必须持锁：它是「读改写」，与调度和完成入账并发时不串行就会互相覆盖；
     * 锁内还要重校归属，因为等锁期间这首歌可能已重新入队、甚至已经又跑起来了
     */
    #abortTask(
        taskId: string,
        attemptId: number,
        apply: (mediaKey: string) => void,
    ): void {
        const key = this.#liveMediaKey(taskId, attemptId);
        if (!key) return;
        this.#tasks.delete(taskId);
        this.#lock
            .run(key, () => {
                const record = this.#registry.get(key);
                // contentKey 跨代不变，光比它认不出「等锁期间已经又起了一代」：
                // 那时再拿旧事件去改状态，会把刚跑起来的新传输删掉或标成失败
                if (
                    record?.transfer?.contentKey === taskId &&
                    !this.#tasks.has(taskId)
                ) {
                    apply(key);
                }
                return Promise.resolve();
            })
            .catch(() => undefined)
            .finally(() => this.pump());
    }

    /**
     * 事件是否属于当前这一代传输；是则返回它的 mediaKey
     * 暂停后续传、失败后重试都会换一代，旧代的迟到事件必须丢掉，否则会改错状态
     */
    #liveMediaKey(taskId: string, attemptId: number): string | undefined {
        const task = this.#tasks.get(taskId);
        return task?.attemptId === attemptId ? task.mediaKey : undefined;
    }
}
