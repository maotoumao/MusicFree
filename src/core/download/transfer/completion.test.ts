import { exists, stat, unlink } from '@dr.pogodin/react-native-fs';

import { downloadEngine } from '@/native/downloadEngine';

import { Download } from '..';

import type { DownloadDeps } from '../types';
import type { ActiveDownloadRecord } from './types';
import type { ILocalMusic } from '@/core/localMusic';
import type { CompletionReceipt } from '@/native/downloadEngine';
import type { MusicItem } from '@/types';

jest.mock('@/native/downloadEngine', () => ({
    isDownloadEngineSupported: true,
    DownloadConflictStrategy: { Rename: 'rename' },
    downloadEngine: {
        setup: jest.fn(async () => undefined),
        cleanupOrphans: jest.fn(async () => undefined),
        getUnackedCompletions: jest.fn(async () => []),
        getActiveTasks: jest.fn(async () => []),
        ackCompletion: jest.fn(),
        start: jest.fn(),
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

// 真实实现走 NativeTimer TurboModule，测试环境拿不到
jest.mock('@/infra/timer', () => ({
    withTimeout: <T>(promise: Promise<T>) => promise,
    delay: (ms: number) => new Promise(r => setTimeout(r, ms)),
}));

jest.mock('@dr.pogodin/react-native-fs', () => ({
    stat: jest.fn(async () => ({ mtime: new Date(1_700_000_000_000) })),
    exists: jest.fn(async () => true),
    unlink: jest.fn(async () => undefined),
}));

// registry 替身；jest.mock 工厂只允许引用 mock 前缀变量
// list() 与 get() 分开存：才能造出「锁外看到 A、拿到锁时已变成 B」这种竞态
const mockRecords: ActiveDownloadRecord[] = [];
const mockCurrent = new Map<string, ActiveDownloadRecord>();
const mockRemoved: string[] = [];
const mockRegistry = { complete: true, removeOk: true };
jest.mock('./registry', () => ({
    DownloadRegistry: class {
        list() {
            return mockRecords;
        }
        isComplete() {
            return mockRegistry.complete;
        }
        findByContentKey(contentKey: string) {
            const owner = mockRecords.find(
                r => r.transfer?.contentKey === contentKey,
            );
            if (owner) {
                return { kind: 'found', mediaKey: owner.mediaKey };
            }
            return mockRegistry.complete
                ? { kind: 'absent' }
                : { kind: 'unknown' };
        }
        get(key: string) {
            return (
                mockCurrent.get(key) ??
                mockRecords.find(r => r.mediaKey === key)
            );
        }
        put() {
            return true;
        }
        remove(key: string) {
            if (!mockRegistry.removeOk) return false;
            mockRemoved.push(key);
            return true;
        }
    },
}));

// 入账现在由 Download 自己写下载库，故接缝下移到存储读写口
jest.mock('../downloaded/store', () => ({
    openDownloadedStore: () => ({}),
    listDownloaded: () => [],
    readDownloaded: (_store: unknown, key: string) => mockReadDownloaded(key),
    writeDownloaded: (_store: unknown, entry: unknown) =>
        mockWriteDownloaded(entry),
    removeDownloaded: () => undefined,
}));

/** 该歌已有的下载条目（用来造「重下顶掉旧文件」的前置状态） */
const mockReadDownloaded = jest.fn((_key: string): unknown => undefined);
/** 返回落库快照（undefined = 落库失败）；默认原样收下 */
const mockWriteDownloaded = jest.fn((entry: unknown): unknown => entry);

const mockDeleteFilesAt = jest.fn(async (paths: readonly string[]) => ({
    deleted: paths.length,
    failed: 0,
    failures: [],
}));

const deps = {
    // 本组用例只走完成入账，调度相关依赖不参与
    config: { get: () => undefined, subscribe: () => () => undefined },
    pluginManager: { getByMediaItem: () => undefined },
    localMusic: {
        addFile: jest.fn(),
        subscribeFilesDeleted: () => () => undefined,
        deleteFilesAt: mockDeleteFilesAt,
    } as unknown as ILocalMusic,
    mediaMeta: { setDownloadData: jest.fn() },
} as unknown as DownloadDeps;

const item = {
    platform: 'demo',
    id: 'song-1',
    title: 't',
} as unknown as MusicItem;

const record = {
    item,
    mediaKey: 'k-1',
    state: 'downloading',
    requestedQuality: 'standard',
    transfer: {
        resolvedQuality: 'high',
        contentKey: 'task-1',
        stagingKey: 'task-1',
    },
} as unknown as ActiveDownloadRecord;

const receipt: CompletionReceipt = {
    taskId: 'task-1',
    contentKey: 'task-1',
    path: '/data/download/t.mp3',
    extension: 'mp3',
    sizeBytes: 2048,
    taggedOk: true,
};

const mockReceipts = jest.mocked(downloadEngine.getUnackedCompletions);
const mockAck = jest.mocked(downloadEngine.ackCompletion);
const mockUnlink = jest.mocked(unlink);
const mockStat = jest.mocked(stat);
const mockExists = jest.mocked(exists);

/** 回执重放发生在 setup 里，故用例统一经 setup 触发 */
const replay = () => new Download(deps).setup();

beforeEach(() => {
    mockRecords.length = 0;
    mockCurrent.clear();
    mockRemoved.length = 0;
    mockRegistry.complete = true;
    mockRegistry.removeOk = true;
    jest.clearAllMocks();
    mockReadDownloaded.mockReturnValue(undefined);
    mockWriteDownloaded.mockImplementation(entry => entry);
    mockReceipts.mockResolvedValue([]);
    mockStat.mockResolvedValue({
        mtime: new Date(1_700_000_000_000),
    } as unknown as Awaited<ReturnType<typeof stat>>);
    mockExists.mockResolvedValue(true);
});

describe('完成入账（回执重放）', () => {
    it('落本地库 → 移出队列 → 确认回执', async () => {
        mockRecords.push(record);
        mockReceipts.mockResolvedValue([receipt]);

        await replay();

        expect(mockWriteDownloaded).toHaveBeenCalledWith({
            item,
            mediaKey: JSON.stringify(['demo', 'song-1']),
            file: {
                path: '/data/download/t.mp3',
                extension: 'mp3',
                sizeBytes: 2048,
                completedAt: 1_700_000_000_000,
                resolvedQuality: 'high',
            },
        });
        expect(mockRemoved).toEqual(['k-1']);
        expect(mockAck).toHaveBeenCalledWith('task-1');
    });

    it('入库失败则不移出队列、不确认回执（下次启动重试）', async () => {
        mockRecords.push(record);
        mockReceipts.mockResolvedValue([receipt]);
        mockWriteDownloaded.mockReturnValue(undefined);

        await replay();

        expect(mockRemoved).toEqual([]);
        expect(mockAck).not.toHaveBeenCalled();
    });

    it('重下顶掉的旧文件会被删除', async () => {
        mockRecords.push(record);
        mockReceipts.mockResolvedValue([receipt]);
        // 库里原本指向另一份文件，本次入账把它顶掉
        mockReadDownloaded.mockReturnValue({
            item,
            mediaKey: JSON.stringify(['demo', 'song-1']),
            file: {
                path: '/data/download/old.mp3',
                extension: 'mp3',
                sizeBytes: 1024,
                completedAt: 1_600_000_000_000,
                resolvedQuality: 'high',
            },
        });

        await replay();

        // 走 localMusic 而非裸 unlink：否则旧路径会留在本地库里，还可能被派生层选成代表文件
        expect(mockDeleteFilesAt).toHaveBeenCalledWith([
            '/data/download/old.mp3',
        ]);
        expect(mockAck).toHaveBeenCalledWith('task-1');
    });

    it('入账到同一路径时不删文件（那就是刚发布的那份）', async () => {
        mockRecords.push(record);
        mockReceipts.mockResolvedValue([receipt]);
        mockReadDownloaded.mockReturnValue({
            item,
            mediaKey: JSON.stringify(['demo', 'song-1']),
            file: {
                path: receipt.path, // 与本次发布同路径
                extension: 'mp3',
                sizeBytes: 1024,
                completedAt: 1_600_000_000_000,
                resolvedQuality: 'high',
            },
        });

        await replay();

        expect(mockDeleteFilesAt).not.toHaveBeenCalled();
        expect(mockUnlink).not.toHaveBeenCalled();
        expect(mockAck).toHaveBeenCalledWith('task-1');
    });

    it('旧文件删不掉不影响入账（只是留个孤儿）', async () => {
        mockRecords.push(record);
        mockReceipts.mockResolvedValue([receipt]);
        mockReadDownloaded.mockReturnValue({
            item,
            mediaKey: JSON.stringify(['demo', 'song-1']),
            file: {
                path: '/data/download/old.mp3',
                extension: 'mp3',
                sizeBytes: 1024,
                completedAt: 1_600_000_000_000,
                resolvedQuality: 'high',
            },
        });
        mockDeleteFilesAt.mockRejectedValueOnce(new Error('boom'));

        await replay();

        expect(mockRemoved).toEqual(['k-1']);
        expect(mockAck).toHaveBeenCalledWith('task-1');
    });

    it('任务已不在队列（被取消 / 删除）时直接确认回执，不入库', async () => {
        mockReceipts.mockResolvedValue([receipt]);

        await replay();

        expect(mockWriteDownloaded).not.toHaveBeenCalled();
        expect(mockAck).toHaveBeenCalledWith('task-1');
    });

    it('记录缺传输身份时同样只确认回执（不敢猜实际音质）', async () => {
        mockRecords.push({
            ...record,
            transfer: undefined,
        } as unknown as ActiveDownloadRecord);
        mockReceipts.mockResolvedValue([receipt]);

        await replay();

        expect(mockWriteDownloaded).not.toHaveBeenCalled();
        expect(mockAck).toHaveBeenCalledWith('task-1');
    });

    it('取回执失败不拖垮启动，仍继续做孤儿清理', async () => {
        mockReceipts.mockRejectedValue(new Error('boom'));

        await expect(replay()).resolves.toBeUndefined();

        expect(jest.mocked(downloadEngine.cleanupOrphans)).toHaveBeenCalled();
    });

    it('队列视图不完整时判不出归属，留着回执不确认', async () => {
        mockRegistry.complete = false;
        mockReceipts.mockResolvedValue([receipt]);

        await replay();

        expect(mockWriteDownloaded).not.toHaveBeenCalled();
        expect(mockAck).not.toHaveBeenCalled();
    });

    it('等锁期间归属已变（改音质重下）则不入账、不动当前记录', async () => {
        mockRecords.push(record); // 锁外反查仍能按 task-1 找到它
        // 锁内重读时已换成新任务的传输身份
        mockCurrent.set('k-1', {
            ...record,
            transfer: {
                resolvedQuality: 'super',
                contentKey: 'task-2',
                stagingKey: 'task-2',
            },
        } as unknown as ActiveDownloadRecord);
        mockReceipts.mockResolvedValue([receipt]);

        await replay();

        expect(mockWriteDownloaded).not.toHaveBeenCalled();
        expect(mockRemoved).toEqual([]);
        expect(mockAck).toHaveBeenCalledWith('task-1');
    });

    it('队列没删干净就不确认回执（否则重启后旧任务复活）', async () => {
        mockRecords.push(record);
        mockReceipts.mockResolvedValue([receipt]);
        mockRegistry.removeOk = false;

        await replay();

        expect(mockWriteDownloaded).toHaveBeenCalled();
        expect(mockAck).not.toHaveBeenCalled();
    });

    it('文件已不在则直接确认回执，不登记指不到文件的记录', async () => {
        mockRecords.push(record);
        mockReceipts.mockResolvedValue([receipt]);
        mockStat.mockRejectedValue(new Error('ENOENT'));
        mockExists.mockResolvedValue(false);

        await replay();

        expect(mockWriteDownloaded).not.toHaveBeenCalled();
        expect(mockAck).toHaveBeenCalledWith('task-1');
    });

    it('文件一时读不到（存储未挂载）则留着回执重试', async () => {
        mockRecords.push(record);
        mockReceipts.mockResolvedValue([receipt]);
        mockStat.mockRejectedValue(new Error('EACCES'));
        mockExists.mockResolvedValue(true);

        await replay();

        expect(mockWriteDownloaded).not.toHaveBeenCalled();
        expect(mockAck).not.toHaveBeenCalled();
    });

    it('单条回执失败不阻断后面的回执', async () => {
        mockRecords.push(record, {
            ...record,
            mediaKey: 'k-2',
            transfer: {
                resolvedQuality: 'low',
                contentKey: 'task-9',
                stagingKey: 'task-9',
            },
        } as unknown as ActiveDownloadRecord);
        mockReceipts.mockResolvedValue([
            receipt,
            { ...receipt, taskId: 'task-9', contentKey: 'task-9' },
        ]);
        mockWriteDownloaded.mockImplementationOnce(() => {
            throw new Error('boom');
        });

        await replay();

        expect(mockAck).toHaveBeenCalledWith('task-9');
        expect(mockAck).not.toHaveBeenCalledWith('task-1');
    });
});
