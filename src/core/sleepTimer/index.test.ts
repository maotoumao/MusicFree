/**
 * SleepTimer 单测：倒计时装 / 撤 / 顺延与上界、到点按「播完整首歌后再停止」分流、
 * 等待期取消与关开关的立即停止、退出等待态必须撤 player 标志、
 * 剩余秒由 deadline 现算、定时句柄不泄漏、自定义时长记忆与越界拒绝
 * infra/timer 的 delay 用可控假实现（记录时长、手动结算）；player / config 用内存 fake
 */
interface FakeTimer {
    ms: number;
    resolve: () => void;
    reject: (e: unknown) => void;
    settled: boolean;
}
const timers: FakeTimer[] = [];

jest.mock('@/infra/timer', () => ({
    delay: (ms: number, opts?: { signal?: AbortSignal }) =>
        new Promise<void>((resolve, reject) => {
            const entry: FakeTimer = {
                ms,
                settled: false,
                resolve: () => {
                    entry.settled = true;
                    resolve();
                },
                reject: e => {
                    entry.settled = true;
                    reject(e);
                },
            };
            timers.push(entry);
            opts?.signal?.addEventListener('abort', () =>
                entry.reject(new Error('AbortError')),
            );
        }),
}));

// sleepTimer 只用 PlaybackState 这个枚举值，但引它会连 NativeAudioEngine TurboModule 一起加载
jest.mock('@/native/audioEngine', () => ({
    PlaybackState: {
        Idle: 'idle',
        Loading: 'loading',
        Buffering: 'buffering',
        Playing: 'playing',
        Paused: 'paused',
        Stopped: 'stopped',
        Error: 'error',
    },
}));

import { PlaybackState } from '@/native/audioEngine';

import { SleepTimer } from '.';

import type { ConfigKey, ConfigSchema, IConfig } from '@/core/config';
import type { IPlayer } from '@/core/player';

/** 最近一次尚未结算的定时 */
function pendingTimer(): FakeTimer {
    const t = timers.filter(x => !x.settled).at(-1);
    if (!t) {
        throw new Error('没有待结算的定时');
    }
    return t;
}

/** 让到期回调跑完（delay 的 then 是微任务） */
async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

function makeConfig(initial: Partial<ConfigSchema> = {}): IConfig {
    const store = new Map<string, unknown>(Object.entries(initial));
    return {
        get: <K extends ConfigKey>(k: K) => store.get(k) as ConfigSchema[K],
        getStored: <K extends ConfigKey>(k: K) =>
            store.get(k) as ConfigSchema[K],
        set: <K extends ConfigKey>(k: K, v?: ConfigSchema[K]) => {
            if (v === undefined) {
                store.delete(k);
            } else {
                store.set(k, v);
            }
        },
        // 只复刻 lastCustomMinutes 的值域（真实规则在 config/index.test.ts 覆盖）
        isValid: (<K extends ConfigKey>(k: K, v: unknown) =>
            k !== 'sleepTimer.lastCustomMinutes' ||
            (typeof v === 'number' &&
                Number.isInteger(v) &&
                v >= 1 &&
                v <= 720)) as IConfig['isValid'],
        subscribe: () => () => {},
    } as unknown as IConfig;
}

function make(initial: Partial<ConfigSchema> = {}) {
    /** player 侧「播完当前曲即停」标志的订阅者（供用例模拟被曲终消费） */
    const flagListeners: Array<(enabled: boolean) => void> = [];
    const player = {
        pause: jest.fn(async () => undefined),
        setPauseAfterCurrent: jest.fn(async () => undefined),
        // 默认播放中：到点才有「当前曲」可等
        getPlaybackState: jest.fn(() => PlaybackState.Playing),
        subscribePauseAfterCurrent: jest.fn(
            (cb: (enabled: boolean) => void) => {
                flagListeners.push(cb);
                cb(false); // 订阅即回放当前值
                return () => {};
            },
        ),
    } as unknown as IPlayer & {
        pause: jest.Mock;
        setPauseAfterCurrent: jest.Mock;
        getPlaybackState: jest.Mock;
    };
    const config = makeConfig(initial);
    const timer = new SleepTimer({ player, config });
    timer.setup();
    /** 模拟 player 广播标志变化（true=置位、false=被消费或被撤） */
    const emitFlag = (enabled: boolean) =>
        flagListeners.forEach(cb => cb(enabled));
    return { timer, player, config, emitFlag };
}

/** 走到「已到点、正等当前曲结束」 */
async function toAwaiting(minutes = 30) {
    const ctx = make({ 'sleepTimer.waitForCurrentEnd': true });
    ctx.timer.start(minutes);
    pendingTimer().resolve();
    await flush();
    expect(ctx.timer.getSchedule()).toEqual({
        kind: 'awaitingCurrentEnd',
        minutes,
    });
    return ctx;
}

beforeEach(() => {
    timers.length = 0;
    jest.useFakeTimers();
});

afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

describe('SleepTimer · 倒计时', () => {
    it('start 进入 countdown，并按分钟数装权威定时', () => {
        const { timer } = make();
        timer.start(30);

        expect(timer.getSchedule()).toMatchObject({
            kind: 'countdown',
            minutes: 30,
        });
        expect(timer.getRemainingSeconds()).toBe(30 * 60);
        expect(pendingTimer().ms).toBe(30 * 60 * 1000);
    });

    it('剩余秒由 deadline 现算，前台被节流后自愈', () => {
        const { timer } = make();
        timer.start(30);
        jest.advanceTimersByTime(10 * 60 * 1000);

        expect(timer.getRemainingSeconds()).toBe(20 * 60);
    });

    it('越界或非整数时长拒绝，且不改变现状', () => {
        const { timer } = make();
        expect(() => timer.start(0)).toThrow(RangeError);
        expect(() => timer.start(721)).toThrow(RangeError);
        expect(() => timer.start(1.5)).toThrow(RangeError);
        expect(() => timer.start(NaN)).toThrow(RangeError);
        expect(timer.getSchedule()).toEqual({ kind: 'off' });
    });

    it('extend 顺延既有 deadline，不吞掉已走过的时间', () => {
        const { timer } = make();
        timer.start(30);
        jest.advanceTimersByTime(10 * 60 * 1000);

        expect(timer.extend(10)).toBe(true);
        // 原本还剩 20 分钟，顺延 10 → 30 分钟（而非从此刻重算的 10 分钟）
        expect(timer.getRemainingSeconds()).toBe(30 * 60);
    });

    it('已顶到上界时 extend 返回 false（调用方据此不该报「已延长」）', () => {
        const { timer } = make();
        timer.start(720);

        expect(timer.extend(10)).toBe(false);
        expect(timer.getRemainingSeconds()).toBe(720 * 60);
    });
    it('extend 校验入参；余量不足以完整顺延时整笔拒绝，不做部分延长', () => {
        const { timer } = make();
        timer.start(700);
        expect(() => timer.extend(NaN)).toThrow(RangeError);
        expect(() => timer.extend(-5)).toThrow(RangeError);

        // 700 + 100 越过 720 上界 → 一分钟都不加，免得报「已延长 100 分钟」却只加了 20
        expect(timer.extend(100)).toBe(false);
        expect(timer.getRemainingSeconds()).toBe(700 * 60);

        expect(timer.extend(20)).toBe(true); // 刚好贴到上界
        expect(timer.getRemainingSeconds()).toBe(720 * 60);
    });

    it('上界随时间前移，但腾出的余量不该被当成可延长', () => {
        const { timer } = make();
        timer.start(720);
        jest.advanceTimersByTime(1000); // 上界后移 1 秒，deadline 未动

        // 只够加 1 秒，不是完整的 10 分钟 → 拒绝
        expect(timer.extend(10)).toBe(false);
        expect(timer.getRemainingSeconds()).toBe(720 * 60 - 1);
    });

    it('extend 在非倒计时状态下是空操作', () => {
        const { timer } = make();
        expect(timer.extend(10)).toBe(false);
        expect(timer.getSchedule()).toEqual({ kind: 'off' });
    });

    it('已 resolve 但回调未跑时被重设：旧到期不得生效', async () => {
        const { timer, player } = make({
            'sleepTimer.waitForCurrentEnd': false,
        });
        timer.start(30);
        const stale = pendingTimer();

        // 关键顺序：先结算旧定时，再在微任务跑之前同步重设
        stale.resolve();
        timer.start(60);
        await flush();

        expect(player.pause).not.toHaveBeenCalled();
        expect(timer.getSchedule()).toMatchObject({
            kind: 'countdown',
            minutes: 60,
        });
    });

    it('重设 / 取消 / 到期后都不残留前台 tick', async () => {
        const { timer } = make({ 'sleepTimer.waitForCurrentEnd': false });
        timer.start(30);
        timer.start(60);
        expect(jest.getTimerCount()).toBe(1); // 重设只留一条

        timer.cancel();
        expect(jest.getTimerCount()).toBe(0);

        timer.start(30);
        pendingTimer().resolve();
        await flush();
        expect(jest.getTimerCount()).toBe(0); // 到期后也清干净
    });

    it('平台定时异常（非 abort 的 reject）撤掉安排，不擅自暂停', async () => {
        const { timer, player } = make();
        timer.start(30);

        pendingTimer().reject(new Error('NativeTimer 挂了'));
        await flush();

        expect(timer.getSchedule()).toEqual({ kind: 'off' });
        expect(timer.getRemainingSeconds()).toBeNull();
        expect(player.pause).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });

    it('cancel 撤销定时，未到点时不触碰播放', () => {
        const { timer, player } = make();
        timer.start(30);
        timer.cancel();

        expect(timer.getSchedule()).toEqual({ kind: 'off' });
        expect(timer.getRemainingSeconds()).toBeNull();
        expect(player.pause).not.toHaveBeenCalled();
    });
});

describe('SleepTimer · 到点分流', () => {
    it('开关关：到点立即暂停', async () => {
        const { timer, player } = make({
            'sleepTimer.waitForCurrentEnd': false,
        });
        timer.start(30);
        pendingTimer().resolve();
        await flush();

        expect(player.pause).toHaveBeenCalled();
        expect(timer.getSchedule()).toEqual({ kind: 'off' });
    });

    it('开关开：到点转入等当前曲结束，并置位 player 标志', async () => {
        const { timer, player } = await toAwaiting();

        expect(player.setPauseAfterCurrent).toHaveBeenCalledWith(true);
        expect(player.pause).not.toHaveBeenCalled();
        expect(timer.getRemainingSeconds()).toBeNull();
    });

    it('等待期 cancel：撤 player 标志并立即停止', async () => {
        const { timer, player } = await toAwaiting();

        timer.cancel();
        expect(player.setPauseAfterCurrent).toHaveBeenLastCalledWith(false);
        expect(player.pause).toHaveBeenCalled();
        expect(timer.getSchedule()).toEqual({ kind: 'off' });
    });

    it('等待期关掉开关：撤标志并立即停止', async () => {
        const { timer, player } = await toAwaiting();

        timer.setWaitForCurrentEnd(false);
        expect(player.setPauseAfterCurrent).toHaveBeenLastCalledWith(false);
        expect(player.pause).toHaveBeenCalled();
        expect(timer.getSchedule()).toEqual({ kind: 'off' });
    });

    it('等待期重设新定时：必须撤掉旧标志，否则下一曲会被误暂停', async () => {
        const { timer, player } = await toAwaiting();

        timer.start(45);
        expect(player.setPauseAfterCurrent).toHaveBeenLastCalledWith(false);
        expect(player.pause).not.toHaveBeenCalled();
        expect(timer.getSchedule()).toMatchObject({
            kind: 'countdown',
            minutes: 45,
        });
    });

    it('到点时并未在播：直接结束，不进永远等不到的等待态', async () => {
        const { timer, player } = make({
            'sleepTimer.waitForCurrentEnd': true,
        });
        (player.getPlaybackState as jest.Mock).mockReturnValue(
            PlaybackState.Paused,
        );
        timer.start(30);
        pendingTimer().resolve();
        await flush();

        expect(timer.getSchedule()).toEqual({ kind: 'off' });
        expect(player.setPauseAfterCurrent).not.toHaveBeenCalledWith(true);
    });

    it('非等待期改开关只落偏好，不影响播放', () => {
        const { timer, player, config } = make();
        timer.setWaitForCurrentEnd(false);

        expect(config.get('sleepTimer.waitForCurrentEnd')).toBe(false);
        expect(player.pause).not.toHaveBeenCalled();
        expect(timer.getWaitForCurrentEnd()).toBe(false);
    });

    it('偏好缺省时视为开启', () => {
        const { timer } = make();
        expect(timer.getWaitForCurrentEnd()).toBe(true);
    });
});

describe('SleepTimer · 等待态收口', () => {
    it('标志被曲终消费 → 等待态收回 off（否则界面会永远显示等待中）', async () => {
        const { timer, emitFlag } = await toAwaiting();

        emitFlag(false); // player 广播：标志已被消费、暂停已生效
        expect(timer.getSchedule()).toEqual({ kind: 'off' });
        expect(timer.getRemainingSeconds()).toBeNull();
    });

    it('自己撤标志引发的回声不会误伤新安排', async () => {
        const { timer, emitFlag } = await toAwaiting();

        timer.start(45); // 等待期重设：内部会撤旧标志
        emitFlag(false); // 撤标志的回声迟到抵达
        expect(timer.getSchedule()).toMatchObject({
            kind: 'countdown',
            minutes: 45,
        });
    });

    it('非等待态收到 false 广播时不动状态', () => {
        const { timer, emitFlag } = make();
        timer.start(30);

        emitFlag(false);
        expect(timer.getSchedule()).toMatchObject({ kind: 'countdown' });
    });
});

describe('SleepTimer · 自定义时长记忆', () => {
    it('记住有效值供下次预填', () => {
        const { timer } = make();
        timer.rememberCustomMinutes(90);
        expect(timer.getLastCustomMinutes()).toBe(90);
    });

    it('越界值不落库', () => {
        const { timer } = make();
        timer.rememberCustomMinutes(900);
        expect(timer.getLastCustomMinutes()).toBeUndefined();
    });
});
