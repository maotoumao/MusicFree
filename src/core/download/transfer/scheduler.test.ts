import { getDefaultStore } from 'jotai';

import { downloadEngine } from '@/native/downloadEngine';

import { Download } from '..';

import { contentKeyOf } from './identity';
import {
    downloadIntervalHoldAtom,
    downloadProgressAtom,
    downloadStartingAtom,
} from './store';

import type { DownloadDeps } from '../types';
import type { ActiveDownloadRecord } from './types';
import type { ILocalMusic } from '@/core/localMusic';
import type { MusicItem, QualityKey } from '@/types';

jest.mock('@/native/downloadEngine', () => ({
    isDownloadEngineSupported: true,
    DownloadConflictStrategy: { Rename: 'rename' },
    downloadEngine: {
        setup: jest.fn(async () => undefined),
        cleanupOrphans: jest.fn(async () => undefined),
        getUnackedCompletions: jest.fn(async () => []),
        getActiveTasks: jest.fn(async () => []),
        ackCompletion: jest.fn(),
        start: jest.fn(async () => ({ attemptId: 1, existingBytes: 0 })),
        onBegin: jest.fn(),
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
        onCanceled: jest.fn(),
        onPaused: jest.fn(),
        onNotificationAction: jest.fn(),
    },
}));

jest.mock('@/infra/paths', () => ({ defaultDownloadDir: '/data/download' }));

// netinfo 在测试环境没有原生模块，import 期就会抛；本文件不测闸门，固定当不花流量的网络
jest.mock('@/infra/network', () => ({
    getNetworkClass: jest.fn(async () => 'nonCellular'),
    onNetworkClassChange: jest.fn(() => () => undefined),
}));

// 真实实现走 NativeTimer TurboModule，测试环境拿不到；abort 语义要保留（间隔等待靠它被叫醒）
jest.mock('@/infra/timer', () => ({
    withTimeout: <T>(promise: Promise<T>) => promise,
    delay: (ms: number, opts?: { signal?: AbortSignal }) => {
        if (mockTimerDown) {
            mockTimerDownCalls += 1;
            // 只失败第一次，之后挂着不返回：真出现空转重试时用例能干净地断言次数，
            // 而不是让无限微任务链把 jest worker 一起饿死
            return mockTimerDownCalls === 1
                ? Promise.reject(new Error('timer unavailable'))
                : new Promise<void>(() => undefined);
        }
        return new Promise<void>((resolve, reject) => {
            const id = setTimeout(resolve, ms);
            opts?.signal?.addEventListener('abort', () => {
                clearTimeout(id);
                const error = new Error('Aborted');
                error.name = 'AbortError';
                reject(error);
            });
        });
    },
}));

/** 让 delay 直接失败，模拟原生计时器起不来 */
let mockTimerDown = false;
/** 「计时器起不来」模式下 delay 被调了几次 */
let mockTimerDownCalls = 0;

jest.mock('@dr.pogodin/react-native-fs', () => ({
    stat: jest.fn(async () => ({ mtime: new Date(1) })),
    exists: jest.fn(async () => true),
    unlink: jest.fn(async () => undefined),
}));

// registry 内存替身：调度要真读写队列，故这里实现一份最小的
const mockQueue = new Map<string, ActiveDownloadRecord>();
// 已下载库的读取结果：「本地已有该音质就跳过入队」由它决定
jest.mock('../downloaded/store', () => ({
    openDownloadedStore: () => ({}),
    listDownloaded: () => [],
    readDownloaded: () => mockDownloadedEntry,
    writeDownloaded: (_store: unknown, entry: unknown) => entry,
    removeDownloaded: () => undefined,
}));

/** 库里该歌已有的条目；undefined = 未下载过 */
let mockDownloadedEntry: unknown;

jest.mock('./registry', () => ({
    DownloadRegistry: class {
        list() {
            return [...mockQueue.values()];
        }
        isComplete() {
            return true;
        }
        get(key: string) {
            return mockQueue.get(key);
        }
        put(record: ActiveDownloadRecord) {
            mockQueue.set(record.mediaKey, record);
            return true;
        }
        remove(key: string) {
            mockQueue.delete(key);
            return true;
        }
    },
}));

const mockStart = jest.mocked(downloadEngine.start);

/** 捕获装上的事件回调，以便在用例里模拟原生发事件 */
let onBegin: ((e: unknown) => void) | undefined;

/** 捕获配置订阅，以便在用例里模拟用户在设置页改了某项 */
let configListeners: { keys: readonly string[]; cb: () => void }[] = [];

/** 触发订阅了该键的所有回调 */
function fireConfigChange(key: string): void {
    for (const listener of configListeners) {
        if (listener.keys.includes(key)) {
            listener.cb();
        }
    }
}

/** 读某首歌当前的传输进度 */
const readProgress = (key: string) =>
    getDefaultStore().get(downloadProgressAtom).get(key);

/** 当前被标为「发起中」（已占槽、正在解析音源）的任务 */
const startingKeys = () => getDefaultStore().get(downloadStartingAtom);

/** 当前被任务间隔挡着的那一条 */
const intervalHoldKey = () => getDefaultStore().get(downloadIntervalHoldAtom);

const itemOf = (id: string) =>
    ({
        platform: 'demo',
        id,
        title: `t-${id}`,
        artist: 'a',
        artwork: 'https://cover/x.jpg',
    } as unknown as MusicItem);

/** 造一个能解析出音源的插件 */
const pluginWithSource = (quality?: QualityKey) => ({
    methods: {
        getMediaSource: jest.fn(async () => ({
            url: 'https://cdn/a.mp3',
            ...(quality ? { quality } : {}),
        })),
    },
});

/** 造一个解析悬而未决的插件：用例自己决定何时让在途的解析返回 */
function pluginWithPendingSource() {
    const resolvers: ((source: { url: string }) => void)[] = [];
    return {
        methods: {
            getMediaSource: jest.fn(
                () =>
                    new Promise<{ url: string }>(resolve => {
                        resolvers.push(resolve);
                    }),
            ),
        },
        /** 让当前在途的解析全部返回同一个直链 */
        settleAll() {
            for (const resolve of resolvers.splice(0)) {
                resolve({ url: 'https://cdn/a.mp3' });
            }
        },
    };
}

function makeDeps(overrides?: {
    config?: Record<string, unknown>;
    plugin?: unknown;
    downloaded?: boolean;
    downloadedQuality?: QualityKey;
}): DownloadDeps {
    const config = overrides?.config ?? {};
    const quality =
        overrides?.downloadedQuality ??
        (overrides?.downloaded ? 'high' : undefined);
    // 下载库里已有这首歌的文件（一首歌只留一份）
    mockDownloadedEntry = quality
        ? {
              item: itemOf('1'),
              mediaKey: JSON.stringify(['demo', '1']),
              file: {
                  path: '/data/download/owned.mp3',
                  extension: 'mp3',
                  sizeBytes: 1,
                  completedAt: 1,
                  resolvedQuality: quality,
              },
          }
        : undefined;
    return {
        config: {
            get: (key: string) => config[key],
            subscribe: (keys: readonly string[], cb: () => void) => {
                configListeners.push({ keys, cb });
                return () => undefined;
            },
        },
        pluginManager: {
            getByMediaItem: () =>
                overrides && 'plugin' in overrides
                    ? overrides.plugin
                    : pluginWithSource(),
        },
        localMusic: {
            addFile: () => undefined,
            subscribeFilesDeleted: () => () => undefined,
        } as unknown as ILocalMusic,
        mediaMeta: { setDownloadData: () => undefined },
    } as unknown as DownloadDeps;
}

/** setup 会放行调度，故用例统一先 setup 再 enqueue */
async function started(deps: DownloadDeps) {
    const download = new Download(deps);
    await download.setup();
    return download;
}

beforeEach(() => {
    mockQueue.clear();
    jest.clearAllMocks();
    mockTimerDown = false;
    mockTimerDownCalls = 0;
    onBegin = undefined;
    configListeners = [];
    jest.mocked(downloadEngine.onBegin).mockImplementation(cb => {
        onBegin = cb as (e: unknown) => void;
        return () => undefined;
    });
    mockStart.mockResolvedValue({
        taskId: 'x',
        attemptId: 1,
        existingBytes: 0,
    });
});

describe('入队', () => {
    it('入队后交给原生，并带上落盘一致的传输身份', async () => {
        const download = await started(makeDeps());

        expect(download.enqueue([itemOf('1')])).toBe(1);
        await flush();

        const request = mockStart.mock.calls[0]![0];
        const expectedKey = contentKeyOf(itemOf('1'), 'standard');
        expect(request.contentKey).toBe(expectedKey);
        expect(request.taskId).toBe(expectedKey);
        expect(request.destDir).toBe('/data/download');
        expect(request.conflictStrategy).toBe('rename');
        expect(request.finalName).toBe('t-1 - a');
    });

    /**
     * 换下载目录不要求队列为空，代价是同一批任务可能分居两个目录：`.part` 躺在哪，
     * 续传就必须回到哪。若这里现读配置（改动前的做法），改过目录之后的每一次续传
     * 都会把新目录递给原生，而原生手上那条任务记的是旧目录 → AlreadyActiveException
     * → 任务在本进程内永久卡死在失败态。传输身份落库时就已经带上目录（先落库再 start），
     * 故失败重试这条路径与真正的续传走的是同一个分支
     */
    it('改过下载目录后重发：仍回 .part 所在的那个目录，不跟着配置走', async () => {
        const config: Record<string, unknown> = {};
        const download = await started(makeDeps({ config }));
        // 第一趟受理失败：传输身份已落库（连同目录），任务转失败等用户重试
        mockStart.mockRejectedValueOnce(new Error('boom'));
        download.enqueue([itemOf('1')]);
        await flush();
        expect(mockStart.mock.calls[0]![0].destDir).toBe('/data/download');
        expect(mockQueue.get(mediaKeyOf('1'))?.transfer?.destDir).toBe(
            '/data/download',
        );

        // 用户改了下载目录，随后重发这条任务
        config['basic.downloadPath'] = '/storage/x';
        download.retry({ platform: 'demo', id: '1' });
        await flush();

        expect(mockStart.mock.calls[1]![0].destDir).toBe('/data/download');
    });

    it('先把传输身份落库再 start（否则 .part 无人认领会被当孤儿删）', async () => {
        const download = await started(makeDeps());
        mockStart.mockImplementation(async () => {
            // start 的这一刻队列里必须已经有 transfer
            expect(mockQueue.get(mediaKeyOf('1'))?.transfer).toBeDefined();
            return { taskId: 'x', attemptId: 1, existingBytes: 0 };
        });

        download.enqueue([itemOf('1')]);
        await flush();

        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('已在队列里的歌不重复入队', async () => {
        const download = await started(makeDeps());

        expect(download.enqueue([itemOf('1')])).toBe(1);
        expect(download.enqueue([itemOf('1')])).toBe(0);
    });

    it('本地已有该歌文件时跳过', async () => {
        const download = await started(makeDeps({ downloaded: true }));

        expect(download.enqueue([itemOf('1')])).toBe(0);
        await flush();
        expect(mockStart).not.toHaveBeenCalled();
    });

    it('本地只有更低音质时放行，让用户能升级', async () => {
        const download = await started(
            makeDeps({
                config: { 'basic.defaultDownloadQuality': 'super' },
                downloadedQuality: 'standard',
            }),
        );

        expect(download.enqueue([itemOf('1')])).toBe(1);
        await flush();
        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('本地已有更高音质则跳过（调低默认档不该静默降级）', async () => {
        const download = await started(
            makeDeps({
                config: { 'basic.defaultDownloadQuality': 'standard' },
                downloadedQuality: 'super',
            }),
        );

        expect(download.enqueue([itemOf('1')])).toBe(0);
    });

    it('事件早于 start 受理返回时也能认领（原生先提交 worker 再 resolve）', async () => {
        const download = await started(makeDeps());
        mockStart.mockImplementation(async request => {
            // 模拟原生在 Promise resolve 前就发事件
            onBegin?.({
                taskId: request.taskId,
                attemptId: request.attemptId,
                disposition: 'fresh',
                totalBytes: 4096,
            });
            return { taskId: request.taskId, attemptId: 1, existingBytes: 0 };
        });

        download.enqueue([itemOf('1')]);
        await flush();

        // 进度被记下 = 事件没被当迟到丢弃
        expect(readProgress(mediaKeyOf('1'))?.totalBytes).toBe(4096);
    });

    it('并发上限生效，超出的留在队列里等', async () => {
        const download = await started(
            makeDeps({ config: { 'basic.maxDownload': 2 } }),
        );

        download.enqueue([itemOf('1'), itemOf('2'), itemOf('3')]);
        await flush();

        expect(mockStart).toHaveBeenCalledTimes(2);
    });

    it('并发配置非法时夹到合法区间，不至于永不下载', async () => {
        const download = await started(
            makeDeps({ config: { 'basic.maxDownload': 0 } }),
        );

        download.enqueue([itemOf('1')]);
        await flush();

        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('调高并发上限立即补槽，不必等当前这批下完', async () => {
        const config: Record<string, unknown> = { 'basic.maxDownload': 1 };
        const download = await started(makeDeps({ config }));

        download.enqueue([itemOf('1'), itemOf('2')]);
        await flush();
        expect(mockStart).toHaveBeenCalledTimes(1);

        config['basic.maxDownload'] = 2;
        fireConfigChange('basic.maxDownload');
        await flush();

        expect(mockStart).toHaveBeenCalledTimes(2);
    });

    it('等原生受理期间不重复占槽（发起与在跑是同一个槽）', async () => {
        // 受理确认迟迟不返回：这段时间任务既在「发起中」也已登记为在跑，两边都数就会白占一个槽
        let acceptFirst: (() => void) | undefined;
        mockStart.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    acceptFirst = () =>
                        resolve({
                            taskId: 'x',
                            attemptId: 1,
                            existingBytes: 0,
                        });
                }),
        );
        const config: Record<string, unknown> = { 'basic.maxDownload': 1 };
        const download = await started(makeDeps({ config }));

        download.enqueue([itemOf('1'), itemOf('2')]);
        await flush();
        expect(mockStart).toHaveBeenCalledTimes(1);

        config['basic.maxDownload'] = 2;
        fireConfigChange('basic.maxDownload');
        await flush();

        expect(mockStart).toHaveBeenCalledTimes(2);
        acceptFirst?.();
        await flush();
    });

    it('发起失败让出槽位，下一条随即补上', async () => {
        // 第一首解析不出可下载地址（落到失败态），第二首正常
        const plugin = {
            methods: {
                getMediaSource: jest.fn((item: MusicItem) =>
                    item.id === '1'
                        ? Promise.resolve(undefined)
                        : Promise.resolve({ url: 'https://cdn/a.mp3' }),
                ),
            },
        };
        const download = await started(
            makeDeps({ config: { 'basic.maxDownload': 1 }, plugin }),
        );

        download.enqueue([itemOf('1'), itemOf('2')]);
        await flush();

        expect(mockQueue.get(mediaKeyOf('1'))?.state).toBe('failed');
        expect(mockStart).toHaveBeenCalledTimes(1);
        expect(mockStart.mock.calls[0]![0].contentKey).toBe(
            contentKeyOf(itemOf('2'), 'standard'),
        );
    });

    it('音源解析并行进行，不必等前一条解析完才碰下一条', async () => {
        const plugin = pluginWithPendingSource();
        const download = await started(
            makeDeps({ config: { 'basic.maxDownload': 3 }, plugin }),
        );

        download.enqueue([itemOf('1'), itemOf('2'), itemOf('3')]);
        await flush();

        // 三条解析同时在途：解析若排在泵的循环里等，这里只会有一条
        expect(plugin.methods.getMediaSource).toHaveBeenCalledTimes(3);
        expect(mockStart).not.toHaveBeenCalled();

        plugin.settleAll();
        await flush();
        expect(mockStart).toHaveBeenCalledTimes(3);
    });

    it('正在解析的任务占并发槽，不会冲破上限', async () => {
        const plugin = pluginWithPendingSource();
        const download = await started(
            makeDeps({ config: { 'basic.maxDownload': 2 }, plugin }),
        );

        download.enqueue([itemOf('1'), itemOf('2'), itemOf('3')]);
        await flush();

        expect(plugin.methods.getMediaSource).toHaveBeenCalledTimes(2);
        // 收尾：别把未决的解析留给后面的用例
        plugin.settleAll();
        await flush();
    });

    it('一条解析卡住不拖住其余任务', async () => {
        // 第一首的解析悬着不返回，其余照常
        let releaseStuck: (() => void) | undefined;
        const plugin = {
            methods: {
                getMediaSource: jest.fn((item: MusicItem) =>
                    item.id === '1'
                        ? new Promise((_, reject) => {
                              releaseStuck = () => reject(new Error('stuck'));
                          })
                        : Promise.resolve({ url: 'https://cdn/a.mp3' }),
                ),
            },
        };
        const download = await started(
            makeDeps({ config: { 'basic.maxDownload': 3 }, plugin }),
        );

        download.enqueue([itemOf('1'), itemOf('2'), itemOf('3')]);
        await flush();

        expect(mockStart).toHaveBeenCalledTimes(2);
        // 收尾：让卡住的那条落地，免得它的解析超时定时器活过本用例
        releaseStuck?.();
        await flush();
    });

    it('采信插件声明的实际音质来算传输身份', async () => {
        const download = await started(
            makeDeps({ plugin: pluginWithSource('super') }),
        );

        download.enqueue([itemOf('1')]);
        await flush();

        expect(mockStart.mock.calls[0]![0].contentKey).toBe(
            contentKeyOf(itemOf('1'), 'super'),
        );
        expect(mockQueue.get(mediaKeyOf('1'))?.transfer?.resolvedQuality).toBe(
            'super',
        );
    });

    it('解析不到音源则标失败，留在队列等用户处置', async () => {
        const download = await started(makeDeps({ plugin: undefined }));

        download.enqueue([itemOf('1')]);
        await flush();

        expect(mockStart).not.toHaveBeenCalled();
        const record = mockQueue.get(mediaKeyOf('1'));
        expect(record?.state).toBe('failed');
        // 对用户与「服务器返回的不是音频」同一回事：这个音源给不出能用的文件
        expect(record?.failure).toBe('sourceUnavailable');
    });

    it('重试时清掉上一次的失败原因，不让排队中的任务还挂着旧错', async () => {
        const download = await started(makeDeps({ plugin: undefined }));
        download.enqueue([itemOf('1')]);
        await flush();

        download.retry({ platform: 'demo', id: '1' });

        // 不 flush：泵一跑又会去解析、又会失败一次，那时看到的原因是新的
        const record = mockQueue.get(mediaKeyOf('1'));
        expect(record?.state).toBe('pending');
        expect(record?.failure).toBeUndefined();
    });

    it('start 抛错也标失败，不留下原生在跑而 JS 不认的任务', async () => {
        const download = await started(makeDeps());
        mockStart.mockRejectedValue(new Error('boom'));

        download.enqueue([itemOf('1')]);
        await flush();

        const record = mockQueue.get(mediaKeyOf('1'));
        expect(record?.state).toBe('failed');
        // 受理失败用户无从下手，只能重试
        expect(record?.failure).toBe('unknown');
    });

    it('原生报错时把错误码翻译成失败原因存进记录', async () => {
        const download = await started(makeDeps());
        download.enqueue([itemOf('1')]);
        await flush();
        const taskId = mockStart.mock.calls[0]![0].contentKey;
        const emitError = jest.mocked(downloadEngine.onError).mock
            .calls[0]![0] as (e: {
            taskId: string;
            attemptId: number;
            code: string;
        }) => void;

        emitError({ taskId, attemptId: 1, code: 'diskFull' });
        await flush(); // 状态改动在 #abortTask 的串行锁内，不是同步发生的

        expect(mockQueue.get(mediaKeyOf('1'))?.failure).toBe('diskFull');
    });

    it('内嵌 tag 带标准字段、自描述身份声明与封面', async () => {
        const download = await started(makeDeps());

        download.enqueue([itemOf('1')]);
        await flush();

        const tags = mockStart.mock.calls[0]![0].tags!;
        expect(tags.fields.TITLE).toEqual(['t-1']);
        expect(tags.fields.ARTIST).toEqual(['a']);
        expect(tags.coverUrl).toBe('https://cover/x.jpg');
        const declaration = JSON.parse(tags.fields.MF_MUSICITEM![0]!);
        expect(declaration.item).toMatchObject({ platform: 'demo', id: '1' });
    });
});

describe('任务间隔', () => {
    it('首轮直接填满并发，不必逐个等间隔', async () => {
        const download = await started(
            makeDeps({
                config: {
                    'basic.maxDownload': 2,
                    'basic.downloadInterval': 60_000,
                },
            }),
        );

        download.enqueue([itemOf('1'), itemOf('2'), itemOf('3')]);
        await flush();

        // 累计发起还不足并发上限，窗口里没有可回看的那一发
        expect(mockStart).toHaveBeenCalledTimes(2);
    });

    it('窗口满了以后，即使腾出槽位也要等够间隔', async () => {
        const download = await started(
            makeDeps({
                config: {
                    'basic.maxDownload': 2,
                    'basic.downloadInterval': 60_000,
                },
            }),
        );

        download.enqueue([itemOf('1'), itemOf('2'), itemOf('3')]);
        await flush();
        expect(mockStart).toHaveBeenCalledTimes(2);

        // 暂停第一首让出槽位：并发不再是瓶颈，拦着第三首的只剩间隔
        emitPaused(mockStart.mock.calls[0]![0].contentKey, 1);
        await flush();

        expect(mockStart).toHaveBeenCalledTimes(2);
    });

    it('并发为 1 时退化成相邻两次发起的最小间隔', async () => {
        const download = await started(
            makeDeps({
                config: {
                    'basic.maxDownload': 1,
                    'basic.downloadInterval': 60_000,
                },
            }),
        );

        download.enqueue([itemOf('1'), itemOf('2')]);
        await flush();
        emitPaused(mockStart.mock.calls[0]![0].contentKey, 1);
        await flush();

        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('间隔满了就发起下一首', async () => {
        const download = await started(
            makeDeps({
                config: {
                    'basic.maxDownload': 1,
                    'basic.downloadInterval': 300,
                },
            }),
        );

        download.enqueue([itemOf('1'), itemOf('2')]);
        await flush();
        emitPaused(mockStart.mock.calls[0]![0].contentKey, 1);
        await flush();
        expect(mockStart).toHaveBeenCalledTimes(1);

        await sleep(500); // 余量给足，别让机器一忙就抖
        expect(mockStart).toHaveBeenCalledTimes(2);
    });

    it('等间隔期间调高并发上限，立刻补槽而不是等满旧间隔', async () => {
        const config: Record<string, unknown> = {
            'basic.maxDownload': 1,
            'basic.downloadInterval': 60_000,
        };
        const download = await started(makeDeps({ config }));

        download.enqueue([itemOf('1'), itemOf('2')]);
        await flush();
        emitPaused(mockStart.mock.calls[0]![0].contentKey, 1);
        await flush(); // 泵此刻卡在间隔等待上

        config['basic.maxDownload'] = 2;
        fireConfigChange('basic.maxDownload');
        await flush();

        // 窗口按新上限回看第 2 次之前那一发——只发起过一次，故没什么可等
        expect(mockStart).toHaveBeenCalledTimes(2);
    });

    it('等间隔期间把间隔改小，立刻按新值放行', async () => {
        const config: Record<string, unknown> = {
            'basic.maxDownload': 1,
            'basic.downloadInterval': 60_000,
        };
        const download = await started(makeDeps({ config }));

        download.enqueue([itemOf('1'), itemOf('2')]);
        await flush();
        emitPaused(mockStart.mock.calls[0]![0].contentKey, 1);
        await flush();

        config['basic.downloadInterval'] = 0;
        fireConfigChange('basic.downloadInterval');
        await flush();

        expect(mockStart).toHaveBeenCalledTimes(2);
    });

    it('并发上限是脏数据时也不放过间隔门控', async () => {
        // 小数会让窗口索引落到不存在的属性上；净化不到位的话间隔就整个失效了
        const download = await started(
            makeDeps({
                config: {
                    'basic.maxDownload': 2.5,
                    'basic.downloadInterval': 60_000,
                },
            }),
        );

        download.enqueue([itemOf('1'), itemOf('2')]);
        await flush();

        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('系统时钟往回跳时作废发起历史，不把队列冻上一大段', async () => {
        const download = await started(
            makeDeps({
                config: {
                    'basic.maxDownload': 1,
                    'basic.downloadInterval': 60_000,
                },
            }),
        );

        download.enqueue([itemOf('1'), itemOf('2')]);
        await flush();
        emitPaused(mockStart.mock.calls[0]![0].contentKey, 1);

        // 把时钟往回拨一小时：刚记下的发起时刻成了「未来」
        const realNow = Date.now.bind(Date);
        const spy = jest
            .spyOn(Date, 'now')
            .mockImplementation(() => realNow() - 3_600_000);
        try {
            await flush();
            expect(mockStart).toHaveBeenCalledTimes(2);
        } finally {
            spy.mockRestore();
        }
    });

    it('间隔定时器起不来时结束本轮，不空转重试', async () => {
        const download = await started(
            makeDeps({
                config: {
                    'basic.maxDownload': 1,
                    'basic.downloadInterval': 60_000,
                },
            }),
        );

        download.enqueue([itemOf('1'), itemOf('2')]);
        await flush();
        emitPaused(mockStart.mock.calls[0]![0].contentKey, 1);
        mockTimerDown = true;

        await flush();

        // 吞掉这类失败会让泵以不变的时长立刻再等一次
        expect(mockTimerDownCalls).toBe(1);
        expect(mockStart).toHaveBeenCalledTimes(1);
    });
});

describe('发起中的可见性', () => {
    it('恢复暂停的任务后不落回排队面，而是显示成正在发起', async () => {
        const plugin = pluginWithPendingSource();
        const download = await started(makeDeps({ plugin }));

        download.enqueue([itemOf('1')]);
        await flush();
        plugin.settleAll();
        await flush();

        // 原生确认暂停：worker 退出、槽位让出
        emitPaused(mockStart.mock.calls[0]![0].contentKey, 1);
        await flush();
        expect(mockQueue.get(mediaKeyOf('1'))?.state).toBe('paused');

        // 恢复会把记录退回 pending 再等调度；不把「已占槽、正在解析」讲出来的话，
        // 这一段用户会看到任务从「进行中」闪去「排队中」再闪回来
        download.resume({ platform: 'demo', id: '1' });
        await flush();

        expect(mockQueue.get(mediaKeyOf('1'))?.state).toBe('pending');
        expect(startingKeys().has(mediaKeyOf('1'))).toBe(true);

        plugin.settleAll();
        await flush();
    });

    it('发起完成后交出「发起中」标记，界面不至于一直显示准备中', async () => {
        const download = await started(makeDeps());

        download.enqueue([itemOf('1')]);
        await flush();

        expect(mockQueue.get(mediaKeyOf('1'))?.state).toBe('downloading');
        expect(startingKeys().has(mediaKeyOf('1'))).toBe(false);
    });

    it('解析不出音源的也要交出「发起中」标记', async () => {
        const download = await started(makeDeps({ plugin: undefined }));

        download.enqueue([itemOf('1')]);
        await flush();

        expect(mockQueue.get(mediaKeyOf('1'))?.state).toBe('failed');
        expect(startingKeys().has(mediaKeyOf('1'))).toBe(false);
    });

    it('等间隔时标出是哪一条在等，等完就清掉', async () => {
        const download = await started(
            makeDeps({
                config: {
                    'basic.maxDownload': 1,
                    'basic.downloadInterval': 300,
                },
            }),
        );

        download.enqueue([itemOf('1'), itemOf('2')]);
        await flush();
        emitPaused(mockStart.mock.calls[0]![0].contentKey, 1);
        await flush();

        expect(intervalHoldKey()).toBe(mediaKeyOf('2'));

        await sleep(500);
        expect(intervalHoldKey()).toBeUndefined();
    });

    it('等间隔期间那条被取消，不留下指向已离队任务的标记', async () => {
        const download = await started(
            makeDeps({
                config: {
                    'basic.maxDownload': 1,
                    'basic.downloadInterval': 60_000,
                },
            }),
        );

        download.enqueue([itemOf('1'), itemOf('2')]);
        await flush();
        emitPaused(mockStart.mock.calls[0]![0].contentKey, 1);
        await flush();
        expect(intervalHoldKey()).toBe(mediaKeyOf('2'));

        // 取消会踢一脚泵；泵不叫醒正在睡的那次等待的话，
        // 这个标记会一直指着已经离队的任务，最长睡满一个间隔
        download.cancel({ platform: 'demo', id: '2' });
        await flush();

        expect(intervalHoldKey()).toBeUndefined();
    });

    it('等间隔期间「全部暂停」，标记随之清掉', async () => {
        const download = await started(
            makeDeps({
                config: {
                    'basic.maxDownload': 1,
                    'basic.downloadInterval': 60_000,
                },
            }),
        );

        download.enqueue([itemOf('1'), itemOf('2')]);
        await flush();
        emitPaused(mockStart.mock.calls[0]![0].contentKey, 1);
        await flush();
        expect(intervalHoldKey()).toBe(mediaKeyOf('2'));

        download.pauseAll();
        await flush();

        expect(mockQueue.get(mediaKeyOf('2'))?.state).toBe('paused');
        expect(intervalHoldKey()).toBeUndefined();
    });
});

const mediaKeyOf = (id: string) => JSON.stringify(['demo', id]);

/** 扮演原生发出 onPaused（worker 已退出、让出传输槽） */
function emitPaused(taskId: string, attemptId: number): void {
    const cb = jest.mocked(downloadEngine.onPaused).mock.calls[0]![0] as (e: {
        taskId: string;
        attemptId: number;
    }) => void;
    cb({ taskId, attemptId });
}

/** 让调度泵的微任务跑完 */
function flush() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/** 真等一小段时间：间隔门控用的是真实时钟 */
function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
