/**
 * 定时关闭：到点自动停止播放
 *
 * 两根正交的轴——触发（多久之后停）由本模块编排，策略（要不要切断正在播的这首）
 * 落到 player.setPauseAfterCurrent；本模块只决定「何时调它」。
 *
 * 权威定时 ≠ 显示刻度：到期靠 infra/timer 的后台 delay（NativeTimer 驱动，息屏可靠）；
 * 面板上跳秒的数字是另一条前台 tick，每次从 deadline 现算，后台被节流也能自愈。
 *
 * 倒计时本身不持久化——进程没了播放也没了，跨重启恢复反而是惊吓；
 * 只有两项偏好落 config，且 UI 直接 useConfig 订阅，本模块不做 jotai 镜像。
 */
import { atom, useAtomValue } from 'jotai';

import { delay } from '@/infra/timer';
import { publishToUi } from '@/infra/uiMirror';
import { PlaybackState } from '@/native/audioEngine';

import type { IConfig } from '@/core/config';
import type { IPlayer } from '@/core/player';

/** 时长边界（分钟）：12 小时够覆盖「放到天亮」，24 小时是伪需求 */
export const SLEEP_TIMER_MIN_MINUTES = 1;
export const SLEEP_TIMER_MAX_MINUTES = 720;

/** 停止安排 —— 模块的全部权威状态；对外只读，改动一律经 ISleepTimer 命令 */
export type SleepSchedule =
    | { readonly kind: 'off' }
    /** 倒计时中：minutes 是用户选的档（供面板回显选中项），deadline 是到期时刻（epoch ms） */
    | {
          readonly kind: 'countdown';
          readonly minutes: number;
          readonly deadline: number;
      }
    /** 已到点、正等当前曲自然结束（仅「播完整首歌后再停止」开启时经历） */
    // 带上原始档位：UI 的单选组在等待期仍需要一个选中项
    | { readonly kind: 'awaitingCurrentEnd'; readonly minutes: number };

/** 定时关闭端口：UX 经此读写；由 app/container 注入实现 */
export interface ISleepTimer {
    /** 启动：订阅 player 的「播完当前曲即停」标志，用于给等待态收口。幂等 */
    setup(): void;
    /** 起倒计时（分钟，越界抛 RangeError）；覆盖既有安排 */
    start(minutes: number): void;
    /**
     * 顺延倒计时（分钟，越界抛 RangeError）；仅 countdown 下有效
     * 全给或不给：余量不足以完整顺延（会越过上界）时不做任何改动
     * 返回是否真的延长了，调用方据此决定报成功还是提示已达上限
     */
    extend(minutes: number): boolean;
    /** 取消（＝面板里的「不开启」）；等待当前曲结束期间调用则立即停止 */
    cancel(): void;
    /** 「播完整首歌后再停止」偏好；等待期间关掉＝立即停止 */
    setWaitForCurrentEnd(enabled: boolean): void;
    /** 记下自定义时长供下次预填（越界值忽略） */
    rememberCustomMinutes(minutes: number): void;
    getSchedule(): SleepSchedule;
    getWaitForCurrentEnd(): boolean;
    /** 倒计时剩余秒；非 countdown 状态为 null */
    getRemainingSeconds(): number | null;
    /** 上次自定义时长（分钟）；从未用过为 undefined */
    getLastCustomMinutes(): number | undefined;
}

export interface SleepTimerDeps {
    /** 到点执行暂停 / 置位「播完当前曲即停」 */
    player: IPlayer;
    /** 持久化两项偏好（倒计时不持久化） */
    config: IConfig;
}

/* atom 保持模块私有：外部只经 hooks 读、经 ISleepTimer 写，杜绝绕过命令改状态 */
const scheduleAtom = atom<SleepSchedule>({ kind: 'off' });
const remainingSecondsAtom = atom<number | null>(null);

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

/** 分钟数边界校验：start / extend 共用 */
function assertMinutes(minutes: number): void {
    if (
        !Number.isInteger(minutes) ||
        minutes < SLEEP_TIMER_MIN_MINUTES ||
        minutes > SLEEP_TIMER_MAX_MINUTES
    ) {
        throw new RangeError(
            `定时时长须为 ${SLEEP_TIMER_MIN_MINUTES}–${SLEEP_TIMER_MAX_MINUTES} 的整数分钟：${minutes}`,
        );
    }
}

export class SleepTimer implements ISleepTimer {
    readonly #player: IPlayer;
    readonly #config: IConfig;

    #schedule: SleepSchedule = { kind: 'off' };
    /** 权威定时的取消句柄；重设 / 取消 / 到期后即弃用 */
    #deadlineAbort: AbortController | null = null;
    /** 前台跳秒 tick（只驱动显示，到期与否不由它裁决） */
    #tickHandle: ReturnType<typeof setInterval> | null = null;
    #setupDone = false;

    constructor(deps: SleepTimerDeps) {
        this.#player = deps.player;
        this.#config = deps.config;
    }

    setup(): void {
        if (this.#setupDone) {
            return;
        }
        this.#setupDone = true;
        // 标志被曲终消费 → 等待结束。自己撤标志引发的回声由 kind 守卫挡住
        // （各命令均先 #commit 再调 player，故回声到达时 kind 已不是 awaitingCurrentEnd）
        this.#player.subscribePauseAfterCurrent(enabled => {
            if (!enabled && this.#schedule.kind === 'awaitingCurrentEnd') {
                this.#commit({ kind: 'off' });
            }
        });
    }

    getSchedule(): SleepSchedule {
        return this.#schedule;
    }

    getRemainingSeconds(): number | null {
        return this.#remainingSeconds();
    }

    getWaitForCurrentEnd(): boolean {
        return this.#config.get('sleepTimer.waitForCurrentEnd') ?? true;
    }

    getLastCustomMinutes(): number | undefined {
        return this.#config.get('sleepTimer.lastCustomMinutes');
    }

    start(minutes: number): void {
        assertMinutes(minutes);
        const wasAwaiting = this.#schedule.kind === 'awaitingCurrentEnd';
        this.#arm(Date.now() + minutes * MINUTE_MS, minutes);
        if (wasAwaiting) {
            // #arm 已提交新安排，此时才撤旧标志：回声到达时 kind 已不是等待态
            this.#releasePauseFlag();
        }
    }

    extend(minutes: number): boolean {
        assertMinutes(minutes);
        const current = this.#schedule;
        if (current.kind !== 'countdown') {
            return false;
        }
        // 顺延既有 deadline（而非从此刻重算），否则「+10 分钟」会吞掉已走过的时间
        const extended = current.deadline + minutes * MINUTE_MS;
        // 全给或不给：余量只够顺延一半却仍报「已延长 10 分钟」是在骗人，
        // 且上界随 now 前移，部分顺延的实际增量还会随点击时机漂移
        if (extended > Date.now() + SLEEP_TIMER_MAX_MINUTES * MINUTE_MS) {
            return false;
        }
        this.#arm(extended, current.minutes);
        return true;
    }

    cancel(): void {
        const wasAwaiting = this.#schedule.kind === 'awaitingCurrentEnd';
        this.#disarm();
        this.#commit({ kind: 'off' }); // 先提交，再碰 player
        if (wasAwaiting) {
            // 已到点、只是在等这首放完；此刻取消＝用户不想再等，立刻停
            this.#releasePauseFlag();
            this.#pauseNow();
        }
    }

    setWaitForCurrentEnd(enabled: boolean): void {
        this.#config.set('sleepTimer.waitForCurrentEnd', enabled);
        if (enabled || this.#schedule.kind !== 'awaitingCurrentEnd') {
            return;
        }
        // 正等这首放完时关掉＝改主意，立即停止
        this.#disarm();
        this.#commit({ kind: 'off' }); // 先提交，再碰 player
        this.#releasePauseFlag();
        this.#pauseNow();
    }

    rememberCustomMinutes(minutes: number): void {
        if (this.#config.isValid('sleepTimer.lastCustomMinutes', minutes)) {
            this.#config.set('sleepTimer.lastCustomMinutes', minutes);
        }
    }

    // —— 内部 ——

    /** 装定时：撤旧的、起新的后台 delay 与前台 tick */
    #arm(deadline: number, minutes: number): void {
        this.#disarm();
        const abort = new AbortController();
        this.#deadlineAbort = abort;
        this.#commit({ kind: 'countdown', minutes, deadline });

        delay(Math.max(0, deadline - Date.now()), {
            runInBackground: true,
            signal: abort.signal,
        }).then(
            () => {
                // 到期与重设竞速：句柄已被换掉说明这次已作废
                if (this.#deadlineAbort === abort) {
                    this.#expire();
                }
            },
            () => {
                // 句柄已换 = 我们自己 abort 的（重设 / 取消），正常路径
                if (this.#deadlineAbort !== abort) {
                    return;
                }
                // 句柄仍是自己却 reject = 平台定时异常。撤掉安排而不擅自暂停：
                // 此处 reject 可能在 start 后立刻发生，那时停掉播放比不生效更突兀
                this.#disarm();
                this.#commit({ kind: 'off' });
            },
        );

        this.#tickHandle = setInterval(
            () => this.#publishRemaining(),
            SECOND_MS,
        );
        this.#publishRemaining();
    }

    #disarm(): void {
        this.#deadlineAbort?.abort();
        this.#deadlineAbort = null;
        if (this.#tickHandle !== null) {
            clearInterval(this.#tickHandle);
            this.#tickHandle = null;
        }
    }

    /** 撤掉 player 侧标志，否则旧标志会在下一曲结束时误暂停 */
    #releasePauseFlag(): void {
        this.#player.setPauseAfterCurrent(false).catch(() => {});
    }

    /** 到点：按偏好决定立刻停，还是等当前曲自然结束 */
    #expire(): void {
        const minutes =
            this.#schedule.kind === 'countdown' ? this.#schedule.minutes : 0;
        this.#disarm();
        // 没在播时等曲终是永远等不到的（暂停 / 空队列都不会再有曲终事件）→ 直接结束
        const canWait =
            this.getWaitForCurrentEnd() &&
            this.#player.getPlaybackState() === PlaybackState.Playing;
        if (!canWait) {
            this.#commit({ kind: 'off' });
            this.#pauseNow();
            return;
        }
        this.#commit({ kind: 'awaitingCurrentEnd', minutes });
        // 置位后由 player 在当前曲自然结束时暂停；本模块不再持有定时
        this.#player.setPauseAfterCurrent(true).catch(() => {});
    }

    #pauseNow(): void {
        this.#player.pause().catch(() => {});
    }

    #commit(schedule: SleepSchedule): void {
        this.#schedule = schedule;
        publishToUi(scheduleAtom, schedule);
        this.#publishRemaining();
    }

    /** 剩余秒始终由 deadline 现算，故前台 tick 被节流后回来能自愈 */
    #remainingSeconds(): number | null {
        const s = this.#schedule;
        return s.kind === 'countdown'
            ? Math.max(0, Math.ceil((s.deadline - Date.now()) / SECOND_MS))
            : null;
    }

    #publishRemaining(): void {
        publishToUi(remainingSecondsAtom, this.#remainingSeconds());
    }
}

/** 裸对象 live-binding，UX 直接 sleepTimer.xxx；由 app/container 装配 */
export let sleepTimer: ISleepTimer;

/** 仅 app/container 调：装配 sleepTimer 单例 */
export function provideSleepTimer(instance: ISleepTimer): void {
    sleepTimer = instance;
}

/** 当前安排（面板回显选中档 / 头部状态） */
export function useSleepSchedule(): SleepSchedule {
    return useAtomValue(scheduleAtom);
}

/** 倒计时剩余秒；非倒计时状态为 null */
export function useSleepRemainingSeconds(): number | null {
    return useAtomValue(remainingSecondsAtom);
}
