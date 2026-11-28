import { downloadEngine } from '@/native/downloadEngine';

import { Download } from '..';

import { contentKeyOf } from './identity';

import type { DownloadDeps } from '../types';
import type { ActiveDownloadRecord } from './types';
import type { ILocalMusic } from '@/core/localMusic';
import type { MusicItem } from '@/types';

jest.mock('@/native/downloadEngine', () => ({
    isDownloadEngineSupported: true,
    DownloadConflictStrategy: { Rename: 'rename' },
    DownloadState: { Paused: 'paused', Pausing: 'pausing' },
    NotificationAction: { PauseAll: 'pauseAll', CancelAll: 'cancelAll' },
    downloadEngine: {
        setup: jest.fn(async () => undefined),
        cleanupOrphans: jest.fn(async () => undefined),
        getUnackedCompletions: jest.fn(async () => []),
        getActiveTasks: jest.fn(async () => []),
        ackCompletion: jest.fn(),
        start: jest.fn(async () => ({
            taskId: 'x',
            attemptId: 1,
            existingBytes: 0,
        })),
        pause: jest.fn(async () => undefined),
        cancel: jest.fn(async () => undefined),
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

jest.mock('@/infra/timer', () => ({
    withTimeout: <T>(promise: Promise<T>) => promise,
    delay: (ms: number) => new Promise(r => setTimeout(r, ms)),
}));

jest.mock('@dr.pogodin/react-native-fs', () => ({
    stat: jest.fn(async () => ({ mtime: new Date(1) })),
    exists: jest.fn(async () => true),
    unlink: jest.fn(async () => undefined),
}));

// 网络替身：用例扮演系统来切换网络归类
type NetworkClass = 'cellular' | 'nonCellular' | 'unknown';
const mockNetwork: { current: NetworkClass } = { current: 'nonCellular' };
const mockNetworkListeners: ((network: NetworkClass) => void)[] = [];
const mockNetworkFailure = { subscribeThrows: false };
jest.mock('@/infra/network', () => ({
    getNetworkClass: jest.fn(async () => mockNetwork.current),
    onNetworkClassChange: jest.fn((cb: (network: NetworkClass) => void) => {
        if (mockNetworkFailure.subscribeThrows) {
            throw new Error('netinfo unavailable');
        }
        mockNetworkListeners.push(cb);
        return () => undefined;
    }),
}));

// registry 内存替身：闸门要真读写队列
const mockQueue = new Map<string, ActiveDownloadRecord>();
// 已下载库不在本组用例范围；不隔离会经 @/infra/storage 拉进 MMKV（ESM，jest 不转译）
jest.mock('../downloaded/store', () => ({
    openDownloadedStore: () => null,
    listDownloaded: () => [],
    readDownloaded: () => undefined,
    writeDownloaded: () => undefined,
    removeDownloaded: () => undefined,
}));

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
        findByContentKey(contentKey: string) {
            const owner = [...mockQueue.values()].find(
                r => r.transfer?.contentKey === contentKey,
            );
            return owner
                ? { kind: 'found', mediaKey: owner.mediaKey }
                : { kind: 'absent' };
        }
    },
}));

const itemOf = (id: string) =>
    ({ platform: 'demo', id, title: `t-${id}`, artist: 'a' } as MusicItem);
const refOf = (id: string) => ({ platform: 'demo', id });
const keyOf = (id: string) => JSON.stringify(['demo', id]);

/** 默认插件：立即解析出音源；用例可换成卡住的实现来模拟慢解析 */
const pluginWithSource = () => ({
    methods: {
        getMediaSource: jest.fn(async () => ({ url: 'https://cdn/a.mp3' })),
    },
});
let currentPlugin: unknown = pluginWithSource();

const mockStart = jest.mocked(downloadEngine.start);
const mockPause = jest.mocked(downloadEngine.pause);

/** 扮演原生发出 onPaused */
let firePaused: (e: { taskId: string; attemptId: number }) => void;

/** 配置替身：允许用例改「使用移动网络下载」开关并触发订阅 */
const mockConfig = { cellularAllowed: false };
const mockConfigListeners: { keys: readonly string[]; cb: () => void }[] = [];

function makeDeps(): DownloadDeps {
    return {
        config: {
            // 并发上限用生产默认值 3：填 1 会让「闸门重开时 worker 还没退出」那条竞态
            // 被并发上限掩盖（槽满直接 return，根本走不到选任务那一步）
            get: (key: string) => {
                if (key === 'basic.maxDownload') return 3;
                if (key === 'basic.useCelluarNetworkDownload') {
                    return mockConfig.cellularAllowed;
                }
                return undefined;
            },
            subscribe: (keys: readonly string[], cb: () => void) => {
                mockConfigListeners.push({ keys, cb });
                return () => undefined;
            },
        },
        pluginManager: {
            getByMediaItem: () => currentPlugin,
        },
        localMusic: {
            addFile: () => undefined,
            subscribeFilesDeleted: () => () => undefined,
        } as unknown as ILocalMusic,
        mediaMeta: { setDownloadData: () => undefined },
    } as unknown as DownloadDeps;
}

/** 扮演系统切换网络 */
async function switchNetwork(network: NetworkClass) {
    mockNetwork.current = network;
    mockNetworkListeners.forEach(cb => cb(network));
    await flush();
}

/** 扮演用户改「使用移动网络下载」开关 */
async function toggleCellularAllowed(allowed: boolean) {
    mockConfig.cellularAllowed = allowed;
    // 只触发订了这个键的回调：并发上限也有自己的订阅，不加区分会让本闸门的用例假阳性
    mockConfigListeners.forEach(listener => {
        if (listener.keys.includes('basic.useCelluarNetworkDownload')) {
            listener.cb();
        }
    });
    await flush();
}

/** 让调度泵的微任务跑完 */
function flush() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

async function started() {
    const download = new Download(makeDeps());
    await download.setup();
    return download;
}

beforeEach(() => {
    mockQueue.clear();
    mockNetworkListeners.length = 0;
    mockConfigListeners.length = 0;
    mockNetwork.current = 'nonCellular';
    mockNetworkFailure.subscribeThrows = false;
    mockConfig.cellularAllowed = false;
    currentPlugin = pluginWithSource();
    jest.clearAllMocks();
    jest.mocked(downloadEngine.onPaused).mockImplementation(cb => {
        firePaused = cb as typeof firePaused;
        return () => undefined;
    });
    mockStart.mockResolvedValue({
        taskId: 'x',
        attemptId: 1,
        existingBytes: 0,
    });
});

describe('Wi-Fi 闸门拦截', () => {
    it('移动网络且开关关闭时不起跑，任务留在排队', async () => {
        mockNetwork.current = 'cellular';
        const download = await started();

        download.enqueue([itemOf('1')]);
        await flush();

        expect(mockStart).not.toHaveBeenCalled();
        // 必须是 pending 而非 failed：等 Wi-Fi 不是失败，界面不该出现「重试」
        expect(mockQueue.get(keyOf('1'))?.state).toBe('pending');
    });

    it('网络判不出来时按蜂窝对待，不拿用户流量赌', async () => {
        mockNetwork.current = 'unknown';
        const download = await started();

        download.enqueue([itemOf('1')]);
        await flush();

        expect(mockStart).not.toHaveBeenCalled();
    });

    it('无连接不算计费问题，照常起跑并由传输自己失败', async () => {
        // 「无网络」在设计稿里走失败态 + 重试，不能伪装成「等待 Wi-Fi」
        mockNetwork.current = 'nonCellular';
        const download = await started();

        download.enqueue([itemOf('1')]);
        await flush();

        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('开关打开时移动网络照下', async () => {
        mockNetwork.current = 'cellular';
        mockConfig.cellularAllowed = true;
        const download = await started();

        download.enqueue([itemOf('1')]);
        await flush();

        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('冷启动就在移动网络上时不抢跑（闸门先于放行调度建好）', async () => {
        mockNetwork.current = 'cellular';
        mockQueue.set(keyOf('1'), {
            item: itemOf('1'),
            mediaKey: keyOf('1'),
            state: 'pending',
            requestedQuality: 'standard',
            enqueuedAt: 1,
        } as unknown as ActiveDownloadRecord);

        await started();
        await flush();

        expect(mockStart).not.toHaveBeenCalled();
    });

    it('闸门装不上时保持拦截，而不是留半套闸门放行', async () => {
        // 读到了蜂窝却没装上监听：此时放行等于在移动网络上直接开下，
        // 而「装了一半」的闸门再没有东西能把它打开
        mockNetwork.current = 'cellular';
        mockNetworkFailure.subscribeThrows = true;

        const download = await started();
        download.enqueue([itemOf('1')]);
        await flush();

        expect(mockStart).not.toHaveBeenCalled();
    });
});

describe('闸门重新打开', () => {
    it('切回 Wi-Fi 后自动继续', async () => {
        mockNetwork.current = 'cellular';
        const download = await started();
        download.enqueue([itemOf('1')]);
        await flush();
        expect(mockStart).not.toHaveBeenCalled();

        await switchNetwork('nonCellular');

        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('用户打开「使用移动网络下载」后立即继续', async () => {
        mockNetwork.current = 'cellular';
        const download = await started();
        download.enqueue([itemOf('1')]);
        await flush();

        await toggleCellularAllowed(true);

        expect(mockStart).toHaveBeenCalledTimes(1);
    });
});

describe('传输途中切到移动网络', () => {
    it('请原生停下，并退回排队而不是暂停', async () => {
        const download = await started();
        download.enqueue([itemOf('1')]);
        await flush();
        const taskId = contentKeyOf(itemOf('1'), 'standard');
        expect(mockQueue.get(keyOf('1'))?.state).toBe('downloading');

        await switchNetwork('cellular');

        expect(mockPause).toHaveBeenCalledWith(taskId);
        // 退回排队才能在 Wi-Fi 回来时自动接上；落成 paused 就得用户再点一次
        expect(mockQueue.get(keyOf('1'))?.state).toBe('pending');
    });

    it('随后到达的 onPaused 不得把它按成暂停态', async () => {
        const download = await started();
        download.enqueue([itemOf('1')]);
        await flush();
        const taskId = contentKeyOf(itemOf('1'), 'standard');

        await switchNetwork('cellular');
        firePaused({ taskId, attemptId: 1 });
        await flush();

        expect(mockQueue.get(keyOf('1'))?.state).toBe('pending');
    });

    it('停下后切回 Wi-Fi 能自动续传', async () => {
        const download = await started();
        download.enqueue([itemOf('1')]);
        await flush();
        const taskId = contentKeyOf(itemOf('1'), 'standard');

        await switchNetwork('cellular');
        firePaused({ taskId, attemptId: 1 });
        await flush();
        await switchNetwork('nonCellular');

        expect(mockStart).toHaveBeenCalledTimes(2);
        // 代次必须递增，否则原生会拒绝这次续传
        expect(mockStart.mock.calls[1]![0].attemptId).toBeGreaterThan(1);
    });

    it('worker 还没退出就切回 Wi-Fi，不许抢着续传', async () => {
        // 原生此刻相位仍是 Pausing，会拒绝恢复，抢跑只会把任务错标成失败
        const download = await started();
        download.enqueue([itemOf('1')]);
        await flush();

        await switchNetwork('cellular');
        await switchNetwork('nonCellular'); // onPaused 还没来
        await flush();

        expect(mockStart).toHaveBeenCalledTimes(1);
        expect(mockQueue.get(keyOf('1'))?.state).toBe('pending');
    });

    it('用户暂停还没落定就关闸，不得抹掉他的暂停意图', async () => {
        // worker 退出要经历断连接、收尾、事件回桥，慢网下能拖上数秒
        const download = await started();
        download.enqueue([itemOf('1')]);
        await flush();
        const taskId = contentKeyOf(itemOf('1'), 'standard');

        download.pause(refOf('1'));
        await switchNetwork('cellular');
        firePaused({ taskId, attemptId: 1 });
        await flush();

        expect(mockQueue.get(keyOf('1'))?.state).toBe('paused');

        // Wi-Fi 回来也不该自动续上——那是用户手动停的
        await switchNetwork('nonCellular');
        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('先关闸、用户再按暂停，onPaused 到达后仍要落成暂停', async () => {
        // 闸门抢先把它退回了排队（闸门只避让已经记下意图的），用户这时才按下暂停。
        // onPaused 若只认「还在下载中」，用户的暂停就被吃掉了——网络一回来它自己又续上
        const download = await started();
        download.enqueue([itemOf('1')]);
        await flush();
        const taskId = contentKeyOf(itemOf('1'), 'standard');

        await switchNetwork('cellular'); // 退回 pending，但 worker 还在跑
        download.pauseAll();
        firePaused({ taskId, attemptId: 1 });
        await flush();

        expect(mockQueue.get(keyOf('1'))?.state).toBe('paused');

        await switchNetwork('nonCellular');
        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('解析音源期间关闸，解析回来也不许绕过闸门', async () => {
        // 解析最长 30s，期间这条还是 pending，不在 #holdForWifi 的扫描范围里
        let release!: (source: unknown) => void;
        currentPlugin = {
            methods: {
                getMediaSource: () =>
                    new Promise(resolve => {
                        release = resolve;
                    }),
            },
        };
        const download = await started();

        download.enqueue([itemOf('1')]);
        await flush();
        await switchNetwork('cellular');
        release({ url: 'https://cdn/a.mp3' });
        await flush();

        expect(mockStart).not.toHaveBeenCalled();
        expect(mockQueue.get(keyOf('1'))?.state).toBe('pending');
    });
});

describe('重连认领', () => {
    it('重载时原生正在移动网络上传输，放行调度前要把它停下', async () => {
        mockNetwork.current = 'cellular';
        const taskId = contentKeyOf(itemOf('1'), 'standard');
        mockQueue.set(keyOf('1'), {
            item: itemOf('1'),
            mediaKey: keyOf('1'),
            state: 'downloading',
            requestedQuality: 'standard',
            enqueuedAt: 1,
            transfer: {
                resolvedQuality: 'standard',
                contentKey: taskId,
                stagingKey: taskId,
            },
        } as unknown as ActiveDownloadRecord);
        jest.mocked(downloadEngine.getActiveTasks).mockResolvedValue([
            { taskId, attemptId: 7, state: 'downloading' },
        ] as never);

        await started();
        await flush();

        expect(mockPause).toHaveBeenCalledWith(taskId);
        expect(mockQueue.get(keyOf('1'))?.state).toBe('pending');
    });
});
