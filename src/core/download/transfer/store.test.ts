import { getDefaultStore } from 'jotai';
import { AppState } from 'react-native';

import { DownloadRegistry } from './registry';
import {
    activeDownloadsAtom,
    clearDownloadProgress,
    downloadProgressAtom,
    setDownloadProgress,
    createDownloadTasksAtom,
    downloadSummaryAtom,
    pendingPhaseOf,
    publishActiveDownloads,
    publishDownloadStarting,
    setDownloadIntervalHold,
    setWifiGateBlocked,
} from './store';

import type {
    ActiveDownloadFilter,
    ActiveDownloadRecord,
    ActiveDownloadState,
} from './types';
import type { MusicItem } from '@/types';

/**
 * uiMirror 的监听是一次性的：本文件任何一条用例首次发布就会注册。
 * 故 spy 必须装在模块作用域，装进 beforeAll 已经太晚
 */
let notifyAppState: ((state: string) => void) | undefined;
jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string,
    cb: (state: string) => void,
) => {
    notifyAppState = cb;
    return { remove: jest.fn() };
}) as unknown as typeof AppState.addEventListener);

// MMKV 替身：本组关心的是队列变化怎么传到界面，存储只需最小内存实现
const mockStore = {
    data: new Map<string, string>(),
    version: 0,
};
jest.mock('@/infra/storage', () => ({
    getOrCreateMMKV: () => ({
        getAllKeys: () => [...mockStore.data.keys()],
        contains: (key: string) => mockStore.data.has(key),
    }),
    getObject: (_s: unknown, key: string) => {
        const raw = mockStore.data.get(key);
        return raw === undefined ? undefined : JSON.parse(raw);
    },
    setObject: (_s: unknown, key: string, value: unknown) => {
        if (value === undefined) {
            mockStore.data.delete(key);
        } else {
            mockStore.data.set(key, JSON.stringify(value));
        }
        return true;
    },
    getStoreVersion: () => mockStore.version,
    setStoreVersion: (_s: unknown, v: number) => {
        mockStore.version = v;
    },
}));

const jotai = getDefaultStore();

const itemOf = (id: string) =>
    ({ platform: 'demo', id, title: `t-${id}`, artist: 'a' } as MusicItem);
const keyOf = (id: string) => JSON.stringify(['demo', id]);

function recordOf(
    id: string,
    state: ActiveDownloadState,
    enqueuedAt: number,
): ActiveDownloadRecord {
    return {
        item: itemOf(id),
        mediaKey: keyOf(id),
        state,
        requestedQuality: 'standard',
        enqueuedAt,
    } as unknown as ActiveDownloadRecord;
}

/** 任务 atom 是按消费者创建的，测试里每次读都现建一个即可 */
const tasksOf = (filter: ActiveDownloadFilter) =>
    jotai.get(createDownloadTasksAtom(filter));
const summary = () => jotai.get(downloadSummaryAtom);

/** 发布是攒到微任务里的，读 atom 前先让它跑完 */
const settle = () => Promise.resolve();

beforeEach(async () => {
    mockStore.data.clear();
    mockStore.version = 0;
    jotai.set(activeDownloadsAtom, new Map());
    setWifiGateBlocked(false);
    publishDownloadStarting(new Set());
    setDownloadIntervalHold(undefined);
    await settle();
});

describe('活动队列镜像', () => {
    it('落库后界面能读到', async () => {
        const registry = new DownloadRegistry();

        registry.put(recordOf('1', 'pending', 1));
        await settle();

        expect(jotai.get(activeDownloadsAtom).get(keyOf('1'))?.state).toBe(
            'pending',
        );
    });

    it('移除后界面同步消失', async () => {
        const registry = new DownloadRegistry();
        registry.put(recordOf('1', 'pending', 1));
        await settle();

        registry.remove(keyOf('1'));
        await settle();

        expect(jotai.get(activeDownloadsAtom).has(keyOf('1'))).toBe(false);
    });

    it('上次进程留下的队列在首次读取后就能看见', async () => {
        mockStore.version = 1;
        mockStore.data.set(
            keyOf('1'),
            JSON.stringify(recordOf('1', 'pending', 1)),
        );
        const registry = new DownloadRegistry();

        registry.list(); // 触发惰性加载
        await settle();

        expect(jotai.get(activeDownloadsAtom).size).toBe(1);
    });

    it('同一 tick 内连续写多条只发布一次（批量入队不能是 O(N²)）', async () => {
        const registry = new DownloadRegistry();
        let publishes = 0;
        const stop = jotai.sub(activeDownloadsAtom, () => {
            publishes += 1;
        });

        for (let i = 0; i < 50; i += 1) {
            registry.put(recordOf(String(i), 'pending', i));
        }
        await settle();
        stop();

        expect(publishes).toBe(1);
        expect(jotai.get(activeDownloadsAtom).size).toBe(50);
    });

    it('中间态的快照根本不会被求值（克隆一次而非 N 次）', async () => {
        // 光数通知次数不够：「每次都克隆、只发布最后一份」的实现照样只通知一次，
        // 但复杂度仍是 O(N²)。真正要锁的是「取快照这个动作本身被合并了」
        const snapshots = Array.from({ length: 5 }, (_, i) =>
            jest.fn(
                () =>
                    new Map([
                        [keyOf(String(i)), recordOf(String(i), 'pending', i)],
                    ]),
            ),
        );

        snapshots.forEach(publishActiveDownloads);
        snapshots.forEach(fn => expect(fn).not.toHaveBeenCalled());

        await settle();

        snapshots.slice(0, -1).forEach(fn => expect(fn).not.toHaveBeenCalled());
        expect(snapshots.at(-1)).toHaveBeenCalledTimes(1);
    });
});

describe('筛选面与摘要', () => {
    /** 灌一批任务并等发布落定 */
    async function seed(records: ActiveDownloadRecord[]) {
        const registry = new DownloadRegistry();
        records.forEach(r => registry.put(r));
        await settle();
        return registry;
    }

    it('进行中含下载中与已暂停，计数只算真正占槽的', async () => {
        await seed([
            recordOf('1', 'downloading', 1),
            recordOf('2', 'paused', 2),
            recordOf('3', 'failed', 3),
        ]);

        expect(tasksOf('inProgress').map(r => r.mediaKey)).toEqual([
            keyOf('1'),
            keyOf('2'),
        ]);
        expect(tasksOf('failed').map(r => r.mediaKey)).toEqual([keyOf('3')]);
        expect(summary().downloading).toBe(1);
        expect(summary().inProgress).toBe(2);
    });

    it('闸门放行时排队项属于「排队中」', async () => {
        await seed([recordOf('1', 'pending', 1)]);

        expect(tasksOf('queued')).toHaveLength(1);
        expect(tasksOf('inProgress')).toHaveLength(0);
        expect(summary().queued).toBe(1);
    });

    it('闸门拦着时排队项转入「进行中」（等待 Wi-Fi 不是排队）', async () => {
        await seed([recordOf('1', 'pending', 1)]);

        setWifiGateBlocked(true);

        expect(tasksOf('queued')).toHaveLength(0);
        expect(tasksOf('inProgress')).toHaveLength(1);
        expect(summary()).toMatchObject({
            downloading: 0, // 等 Wi-Fi 的没占槽
            inProgress: 1,
            queued: 0,
        });
    });

    it('已占槽正在解析音源的任务归「进行中」，不算排队', async () => {
        await seed([recordOf('1', 'pending', 1), recordOf('2', 'pending', 2)]);

        // 它们在库里还是 pending，但槽位已经占住——算排队的话，
        // 用户会看到并发上限设了却全写着排队，以为设置没生效
        publishDownloadStarting(new Set([keyOf('1')]));

        expect(tasksOf('inProgress').map(r => r.mediaKey)).toEqual([
            keyOf('1'),
        ]);
        expect(tasksOf('queued').map(r => r.mediaKey)).toEqual([keyOf('2')]);
        expect(summary()).toMatchObject({ inProgress: 1, queued: 1 });
    });

    it('闸门关着且同时有任务在解析时，每条排队只算一次', async () => {
        await seed([recordOf('1', 'pending', 1), recordOf('2', 'pending', 2)]);

        publishDownloadStarting(new Set([keyOf('1')]));
        setWifiGateBlocked(true);

        expect(tasksOf('inProgress')).toHaveLength(2);
        expect(summary()).toMatchObject({ inProgress: 2, queued: 0 });
    });

    it('三个筛选面一律按入队时间排序，不按状态分段', async () => {
        // 乱序插入 + 混合状态：若哪一面改成按状态分段或沿用存储枚举顺序，这里就会红
        await seed([
            recordOf('5', 'paused', 50),
            recordOf('2', 'failed', 20),
            recordOf('4', 'downloading', 40),
            recordOf('1', 'downloading', 10),
            recordOf('6', 'failed', 60),
            recordOf('3', 'paused', 30),
        ]);

        expect(tasksOf('inProgress').map(r => r.mediaKey)).toEqual([
            keyOf('1'), // downloading
            keyOf('3'), // paused
            keyOf('4'), // downloading
            keyOf('5'), // paused
        ]);
        expect(tasksOf('failed').map(r => r.mediaKey)).toEqual([
            keyOf('2'),
            keyOf('6'),
        ]);
    });

    it('状态变化不让条目在面内跳位置', async () => {
        const registry = await seed([
            recordOf('1', 'paused', 10),
            recordOf('2', 'paused', 20),
            recordOf('3', 'paused', 30),
        ]);

        // 中间那条开始下载：仍按入队时间待在原位，不因状态变了被排到组首或组尾
        registry.put(recordOf('2', 'downloading', 20));
        await settle();

        expect(tasksOf('inProgress').map(r => r.mediaKey)).toEqual([
            keyOf('1'),
            keyOf('2'),
            keyOf('3'),
        ]);
    });

    it('排队中按入队时间，与存储写入次序无关', async () => {
        await seed([
            recordOf('3', 'pending', 30),
            recordOf('1', 'pending', 10),
            recordOf('2', 'pending', 20),
        ]);

        expect(tasksOf('queued').map(r => r.mediaKey)).toEqual([
            keyOf('1'),
            keyOf('2'),
            keyOf('3'),
        ]);
    });
});

describe('排队阶段', () => {
    const phaseOf = (context: Partial<Parameters<typeof pendingPhaseOf>[1]>) =>
        pendingPhaseOf(keyOf('1'), {
            starting: new Set(),
            intervalHold: undefined,
            waitingForWifi: false,
            ...context,
        });

    it('什么都没拦着就是在等并发槽位', () => {
        expect(phaseOf({})).toBe('queued');
    });

    it('被间隔挡住的那一条报间隔，别的仍是排队', () => {
        expect(phaseOf({ intervalHold: keyOf('1') })).toBe('waitingInterval');
        expect(phaseOf({ intervalHold: keyOf('2') })).toBe('queued');
    });

    it('闸门关着时压过间隔：任务根本轮不到发起', () => {
        expect(
            phaseOf({ waitingForWifi: true, intervalHold: keyOf('1') }),
        ).toBe('waitingWifi');
    });

    it('已在解析音源的压过闸门：闸门要等解析回来才退得回它', () => {
        expect(
            phaseOf({
                starting: new Set([keyOf('1')]),
                waitingForWifi: true,
            }),
        ).toBe('resolvingSource');
    });
});

describe('后台批量下载时的进度表', () => {
    function setAppState(state: string): void {
        (AppState as { currentState: string | null }).currentState = state;
    }

    function progress(bytes: number) {
        return { downloadedBytes: bytes, totalBytes: 100 };
    }

    beforeEach(() => {
        setAppState('active');
        for (const key of getDefaultStore().get(downloadProgressAtom).keys()) {
            clearDownloadProgress(key);
        }
    });

    afterAll(() => {
        setAppState('active');
    });

    it('连写多个任务都在——读改写若从 atom 取底表，只有最后一个能活下来', () => {
        setAppState('background');
        setDownloadProgress('a', progress(1));
        setDownloadProgress('b', progress(2));
        setDownloadProgress('c', progress(3));
        setAppState('active');
        notifyAppState?.('active');

        expect([...getDefaultStore().get(downloadProgressAtom).keys()]).toEqual(
            ['a', 'b', 'c'],
        );
    });

    it('清掉的任务不会被后一次写入复活', () => {
        // 先在前台把 done 写进 atom：过期底表非空，才谈得上「被复活」。
        // 复活的后果是已完成的任务赖在活动列表里，且再没有 tick 来纠正
        setDownloadProgress('done', progress(100));

        setAppState('background');
        setDownloadProgress('running', progress(20));
        clearDownloadProgress('done');
        setDownloadProgress('running', progress(40));
        setAppState('active');
        notifyAppState?.('active');

        expect([...getDefaultStore().get(downloadProgressAtom).keys()]).toEqual(
            ['running'],
        );
        expect(
            getDefaultStore().get(downloadProgressAtom).get('running')
                ?.downloadedBytes,
        ).toBe(40);
    });
});
