import { mkdir, writeFile } from '@dr.pogodin/react-native-fs';

import { downloadEngine } from '@/native/downloadEngine';

import { Download } from '.';

import type { ActiveDownloadRecord } from './transfer/types';
import type { DownloadDeps } from './types';
import type { ILocalMusic } from '@/core/localMusic';
import type { MusicItem } from '@/types';

jest.mock('@/native/downloadEngine', () => ({
    isDownloadEngineSupported: true,
    DownloadConflictStrategy: { Rename: 'rename' },
    downloadEngine: {
        setup: jest.fn(async () => undefined),
        cleanupOrphans: jest.fn(async () => 0),
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
    mkdir: jest.fn(async () => undefined),
    writeFile: jest.fn(async () => undefined),
}));

// registry 替身：支撑 list() / isComplete()，并记下 enqueue 实际写进来的条目
// jest.mock 工厂只允许引用 mock 前缀变量（防未初始化引用）
const mockRecords: ActiveDownloadRecord[] = [];
const mockState = { complete: true, putFails: false };
/** 实际入队的记录，用于核对 enqueue 筛掉了什么 */
const mockPuts: ActiveDownloadRecord[] = [];
/** 假已下载库：不隔离会经 @/infra/storage 拉进 MMKV（ESM，jest 不转译） */
const mockShelf = new Map<
    string,
    { mediaKey: string; file: { path: string } }
>();
jest.mock('./downloaded/store', () => ({
    openDownloadedStore: () => ({}),
    listDownloaded: () => [...mockShelf.values()],
    readDownloaded: (_s: unknown, key: string) => mockShelf.get(key),
    writeDownloaded: () => undefined,
    removeDownloaded: (_s: unknown, key: string) => {
        mockShelf.delete(key);
    },
    getDownloadedEntries: () => mockShelf,
}));

jest.mock('./transfer/registry', () => ({
    DownloadRegistry: class {
        list() {
            return mockRecords;
        }
        isComplete() {
            return mockState.complete;
        }
        get() {
            return undefined;
        }
        put(record: ActiveDownloadRecord) {
            if (mockState.putFails) {
                return false;
            }
            mockPuts.push(record);
            // 就地更新替身里的那条，让「钉住之后再读」看到的是新值
            const at = mockRecords.findIndex(
                r => r.mediaKey === record.mediaKey,
            );
            if (at >= 0) {
                mockRecords[at] = record;
            }
            return true;
        }
        remove() {
            return true;
        }
    },
}));

/** 有状态 config 替身：改下载目录要真读真写这一项 */
const mockConfigValues: Record<string, unknown> = {};
const deps = {
    config: {
        get: (key: string) => mockConfigValues[key],
        set: (key: string, value: unknown) => {
            mockConfigValues[key] = value;
        },
        subscribe: () => () => undefined,
    },
    pluginManager: { getByMediaItem: () => undefined },
    localMusic: {
        addFile: () => undefined,
        subscribeFilesDeleted: (cb: (paths: readonly string[]) => void) => {
            mockFilesDeletedListeners.push(cb);
            return () => undefined;
        },
    } as unknown as ILocalMusic,
    mediaMeta: { setDownloadData: () => undefined },
} as unknown as DownloadDeps;

/** localMusic 收到的「文件已删除」订阅者，用来验证装配确实接上了 */
const mockFilesDeletedListeners: ((paths: readonly string[]) => void)[] = [];

const recordOf = (
    id: string,
    transfer?: {
        resolvedQuality: string;
        contentKey: string;
        stagingKey: string;
        destDir?: string;
    },
) =>
    ({
        item: { platform: 'demo', id, title: 't' } as unknown as MusicItem,
        mediaKey: `k-${id}`,
        state: 'downloading',
        requestedQuality: 'standard',
        ...(transfer ? { transfer } : {}),
    } as unknown as ActiveDownloadRecord);

const mockSetup = jest.mocked(downloadEngine.setup);
const mockCleanup = jest.mocked(downloadEngine.cleanupOrphans);

beforeEach(() => {
    for (const key of Object.keys(mockConfigValues)) {
        delete mockConfigValues[key];
    }
    mockRecords.length = 0;
    mockState.complete = true;
    mockState.putFails = false;
    mockShelf.clear();
    mockFilesDeletedListeners.length = 0;
    mockPuts.length = 0;
    jest.clearAllMocks();
});

/**
 * 改下载目录：三道门（平台 / 队列视图可信 / 可写）都过了才落配置
 *
 * **不要求队列为空**：落盘目录钉在任务的传输身份上，已交给原生的任务继续在原目录
 * 跑完；两趟孤儿清理各带该目录下仍活着的 stagingKey，别把它们的断点当残留删掉
 */
describe('改下载目录', () => {
    const mockMkdir = jest.mocked(mkdir);
    const mockWriteFile = jest.mocked(writeFile);
    /** 每次清理：清的哪个目录 + 那一刻配置里的值（顺序是契约，见 #changeDownloadDir） */
    let cleanupCalls: { dir: string; configAtCall: unknown }[];
    beforeEach(() => {
        cleanupCalls = [];
        mockCleanup.mockImplementation(async (dir: string) => {
            cleanupCalls.push({
                dir,
                configAtCall: mockConfigValues['basic.downloadPath'],
            });
            return 0; // 0 = 清干净了
        });
    });

    it('队列为空且可写：落配置，并清掉旧目录里没人认领的断点文件', async () => {
        const download = new Download(deps);

        await expect(
            download.setDownloadDir('/storage/emulated/0/Music'),
        ).resolves.toBe('ok');

        expect(mockConfigValues['basic.downloadPath']).toBe(
            '/storage/emulated/0/Music',
        );
        expect(download.getDownloadDir()).toBe('/storage/emulated/0/Music');
        expect(download.isUsingDefaultDownloadDir()).toBe(false);
        // 顺序是契约：
        // 1. 先清**新**目录，且此刻配置还指向旧目录——那样才能保证清的时候没人往新目录写
        //    （切完再清就是在清一个活目录，清理期间入队的任务正好会接管陈旧 `.part`）
        // 2. 再清**旧**目录，此刻配置已切走，旧目录不会再有人写
        expect(cleanupCalls).toEqual([
            { dir: '/storage/emulated/0/Music', configAtCall: undefined },
            {
                dir: '/data/download',
                configAtCall: '/storage/emulated/0/Music',
            },
        ]);
    });

    it('队列里还有任务：照换不误，在跑的那条留在旧目录跑完', async () => {
        mockRecords.push(
            recordOf('a', {
                resolvedQuality: 'standard',
                contentKey: 'c-a',
                stagingKey: 's-a',
                destDir: '/data/download', // 默认目录，也就是本次的「旧目录」
            }),
        );
        const download = new Download(deps);

        await expect(download.setDownloadDir('/storage/x')).resolves.toBe('ok');

        expect(mockConfigValues['basic.downloadPath']).toBe('/storage/x');
        expect(cleanupCalls).toEqual([
            { dir: '/storage/x', configAtCall: undefined },
            { dir: '/data/download', configAtCall: '/storage/x' },
        ]);
        // 清旧目录时必须放过它的 `.part`——那条任务还要回来续传
        expect(mockCleanup).toHaveBeenLastCalledWith('/data/download', ['s-a']);
    });

    /**
     * 升级路径：本字段之前落库的任务没有 destDir，只能按「当前配置」解释——
     * 而当前配置正是这一刀要改的东西。若在写配置**之后**才算旧目录的存活集合，
     * 这些旧任务会被判成属于新目录，留在旧目录的断点随即被当孤儿删掉
     */
    it('旧记录没有 destDir：换目录时仍按旧目录解释，断点不被误删', async () => {
        mockRecords.push(
            recordOf('legacy', {
                resolvedQuality: 'standard',
                contentKey: 'c-legacy',
                stagingKey: 's-legacy',
                // 刻意不给 destDir
            }),
        );
        const download = new Download(deps);

        await expect(download.setDownloadDir('/storage/x')).resolves.toBe('ok');

        // 新目录那趟不该保护它（它的 `.part` 不在那儿）
        expect(mockCleanup).toHaveBeenNthCalledWith(1, '/storage/x', []);
        // 旧目录那趟必须保护它
        expect(mockCleanup).toHaveBeenNthCalledWith(2, '/data/download', [
            's-legacy',
        ]);
    });

    /**
     * 只在当次清理的 keep-list 里放过旧记录不够——记录本身还在漂：写完配置，
     * 同一条无 destDir 的记录就被解释成属于新目录了。故换目录前要把它钉住，
     * 否则 (a) 续传把新目录递给原生 → AlreadyActiveException；
     * (b) 下一次换目录时它留在旧目录的断点会被当孤儿删掉
     */
    it('旧记录换目录后被钉在旧目录上：再换一次也不会认错', async () => {
        mockRecords.push(
            recordOf('legacy', {
                resolvedQuality: 'standard',
                contentKey: 'c-legacy',
                stagingKey: 's-legacy',
            }),
        );
        const download = new Download(deps);

        await expect(download.setDownloadDir('/storage/x')).resolves.toBe('ok');

        // 钉住了：记录里现在写着它当初那个目录
        expect(mockRecords[0]?.transfer?.destDir).toBe('/data/download');

        // 再换回去：目标目录里那份断点必须被放过（认错的话它会被当孤儿删掉）
        mockCleanup.mockClear();
        await expect(download.setDownloadDir('/data/download')).resolves.toBe(
            'ok',
        );
        expect(mockCleanup).toHaveBeenNthCalledWith(1, '/data/download', [
            's-legacy',
        ]);
    });

    it('钉不下去（落库失败）就不敢切：此后再没机会知道它们在哪', async () => {
        mockRecords.push(
            recordOf('legacy', {
                resolvedQuality: 'standard',
                contentKey: 'c-legacy',
                stagingKey: 's-legacy',
            }),
        );
        mockState.putFails = true;
        const download = new Download(deps);

        await expect(download.setDownloadDir('/storage/x')).resolves.toBe(
            'pinFailed',
        );
        expect(mockConfigValues['basic.downloadPath']).toBeUndefined();
    });

    it('来回换目录：新目录里若躺着仍在跑的任务的断点，清理要放过它', async () => {
        // A → B 之后再换回 A：那条任务的 `.part` 还钉在 A 里
        mockConfigValues['basic.downloadPath'] = '/storage/b';
        mockRecords.push(
            recordOf('a', {
                resolvedQuality: 'standard',
                contentKey: 'c-a',
                stagingKey: 's-a',
                destDir: '/storage/a',
            }),
        );
        const download = new Download(deps);

        await expect(download.setDownloadDir('/storage/a')).resolves.toBe('ok');

        expect(mockCleanup).toHaveBeenNthCalledWith(1, '/storage/a', ['s-a']);
    });

    it('写不进去（没授权 / 只读介质）：拒绝并保留原配置', async () => {
        mockWriteFile.mockRejectedValueOnce(new Error('EACCES'));
        const download = new Download(deps);

        await expect(download.setDownloadDir('/storage/x')).resolves.toBe(
            'notWritable',
        );

        expect(mockConfigValues['basic.downloadPath']).toBeUndefined();
        expect(mockCleanup).not.toHaveBeenCalled();
    });

    it('registry 视图不完整：算不出该放过谁，按 staleFiles 拒绝', async () => {
        // 存活集合不可信时宁可不换，也不能拿一份可能漏人的 keep-list 去删目标目录
        mockState.complete = false;
        const download = new Download(deps);

        await expect(download.setDownloadDir('/storage/x')).resolves.toBe(
            'staleFiles',
        );

        expect(mockConfigValues['basic.downloadPath']).toBeUndefined();
        expect(mockCleanup).not.toHaveBeenCalled();
    });

    it('探盘期间又有任务入队：照换，那条新任务自己会钉住当时的目录', async () => {
        // 探盘要过一趟盘，这段时间用户完全可能又点了下载。它还没开始传输（无 transfer）、
        // 盘上没有 `.part`，发起时会把那一刻的目录钉进自己的传输身份，故不必再拦
        mockWriteFile.mockImplementationOnce(async () => {
            mockRecords.push(recordOf('late'));
            return undefined;
        });
        const download = new Download(deps);

        await expect(download.setDownloadDir('/storage/x')).resolves.toBe('ok');

        expect(mockConfigValues['basic.downloadPath']).toBe('/storage/x');
    });

    it('新目录里有清不掉的残留：不敢切过去（残留会被无条件续传接管）', async () => {
        mockCleanup.mockImplementationOnce(async () => 2);
        const download = new Download(deps);

        await expect(download.setDownloadDir('/storage/x')).resolves.toBe(
            'staleFiles',
        );

        expect(mockConfigValues['basic.downloadPath']).toBeUndefined();
        // 旧目录一次都没碰
        expect(mockCleanup).toHaveBeenCalledTimes(1);
    });

    it('两次修改重叠：后一次直接 changing（否则「新目录没人写」的前提就没了）', async () => {
        const download = new Download(deps);

        const first = download.setDownloadDir('/storage/a');
        const second = download.setDownloadDir('/storage/b');

        await expect(second).resolves.toBe('changing');
        await expect(first).resolves.toBe('ok');
        expect(mockConfigValues['basic.downloadPath']).toBe('/storage/a');
    });

    it('相对路径直接判非法，不必探盘', async () => {
        const download = new Download(deps);

        await expect(download.setDownloadDir('Music')).resolves.toBe('invalid');

        expect(mockMkdir).not.toHaveBeenCalled();
    });

    it('手挑到默认目录：归一成「跟随默认」的空串，不探盘不清理', async () => {
        mockConfigValues['basic.downloadPath'] = '/storage/legacy';
        const download = new Download(deps);
        // 先让当前目录就是 /storage/legacy，再手挑默认目录 → 走完整流程回到默认
        await expect(download.setDownloadDir('/data/download')).resolves.toBe(
            'ok',
        );

        // 存的是空串而不是绝对路径：否则配置被钉住，而 UI 此时不显示「恢复默认」，用户解不开
        expect(mockConfigValues['basic.downloadPath']).toBe('');
    });

    it('恢复默认把手挑出来的绝对路径换回空串（否则默认目录变了它不跟着走）', async () => {
        mockConfigValues['basic.downloadPath'] = '/data/download';
        const download = new Download(deps);

        await expect(download.resetDownloadDir()).resolves.toBe('ok');

        expect(mockConfigValues['basic.downloadPath']).toBe('');
        expect(mockCleanup).not.toHaveBeenCalled(); // 目录没变，无需清理
    });

    it('恢复默认存空串——存的是「跟随默认」，默认目录换了也跟着走', async () => {
        mockConfigValues['basic.downloadPath'] = '/storage/x';
        const download = new Download(deps);

        await expect(download.resetDownloadDir()).resolves.toBe('ok');

        expect(mockConfigValues['basic.downloadPath']).toBe('');
        expect(cleanupCalls.map(c => c.dir)).toEqual([
            '/data/download',
            '/storage/x',
        ]);
        expect(download.isUsingDefaultDownloadDir()).toBe(true);
    });
});

describe('enqueue', () => {
    const musicOf = (platform: string, id: string) =>
        ({ platform, id, title: id } as unknown as MusicItem);

    it('跳过本地来源的歌——指向设备上已有的文件，没有可下载的 HTTP 源', () => {
        const accepted = new Download(deps).enqueue([
            musicOf('本地', 'l1'),
            musicOf('demo', 'd1'),
        ]);

        expect(accepted).toBe(1);
        expect(mockPuts.map(r => r.item.platform)).toEqual(['demo']);
    });

    it('整批都是本地来源时一条不入，调用方据此给回执', () => {
        const accepted = new Download(deps).enqueue([
            musicOf('本地', 'l1'),
            musicOf('本地', 'l2'),
        ]);

        expect(accepted).toBe(0);
        expect(mockPuts).toHaveLength(0);
    });
});

describe('装配', () => {
    it('构造即订阅「文件已删除」，并把它接到已下载库上', () => {
        mockShelf.set('k-1', { mediaKey: 'k-1', file: { path: '/dl/t.mp3' } });
        // 只构造、不 setup：记录清理与平台有没有下载引擎无关
        new Download(deps);

        expect(mockFilesDeletedListeners).toHaveLength(1);
        mockFilesDeletedListeners[0]?.(['/dl/t.mp3']);

        expect(mockShelf.has('k-1')).toBe(false);
    });
});

describe('Download.setup', () => {
    it('初始化引擎并按存活任务清理孤儿 .part', async () => {
        mockRecords.push(
            recordOf('a', {
                resolvedQuality: 'high',
                contentKey: 'ck-a',
                stagingKey: 'sk-a',
            }),
        );

        await new Download(deps).setup();

        expect(mockSetup).toHaveBeenCalledTimes(1);
        expect(mockCleanup).toHaveBeenCalledWith('/data/download', ['sk-a']);
    });

    /**
     * 换过目录后同一批任务会分居两个目录：仍在跑的任务的 `.part` 还钉在旧目录里，
     * 而那个目录同样可能有上次被强杀留下的孤儿。只扫当前目录的话它们再没人回收
     */
    it('任务分居两个目录时，两个目录都要清，且各带各的存活集合', async () => {
        mockConfigValues['basic.downloadPath'] = '/storage/new';
        mockRecords.push(
            recordOf('a', {
                resolvedQuality: 'high',
                contentKey: 'ck-a',
                stagingKey: 'sk-a',
                destDir: '/storage/old',
            }),
            recordOf('b', {
                resolvedQuality: 'high',
                contentKey: 'ck-b',
                stagingKey: 'sk-b',
                destDir: '/storage/new',
            }),
        );

        await new Download(deps).setup();

        expect(mockCleanup).toHaveBeenCalledWith('/storage/new', ['sk-b']);
        expect(mockCleanup).toHaveBeenCalledWith('/storage/old', ['sk-a']);
    });

    it('存活集合用落盘时的 stagingKey，不拿当前算法重算', async () => {
        // 造一个与当前算法必然不同的历史 key：算法演进后旧 .part 仍须被保护
        mockRecords.push(
            recordOf('b', {
                resolvedQuality: 'low',
                contentKey: 'legacy-content-key',
                stagingKey: 'legacy-staging-key',
            }),
        );

        await new Download(deps).setup();

        expect(mockCleanup).toHaveBeenCalledWith('/data/download', [
            'legacy-staging-key',
        ]);
    });

    it('尚未开始传输的任务不进存活集合（盘上不会有它的 .part）', async () => {
        mockRecords.push(recordOf('c'));

        await new Download(deps).setup();

        expect(mockCleanup).toHaveBeenCalledWith('/data/download', []);
    });

    it('registry 视图不完整时整体跳过清理（宁可漏删不可误删）', async () => {
        mockState.complete = false;
        mockRecords.push(
            recordOf('d', {
                resolvedQuality: 'high',
                contentKey: 'ck-d',
                stagingKey: 'sk-d',
            }),
        );

        await new Download(deps).setup();

        expect(mockSetup).toHaveBeenCalledTimes(1);
        expect(mockCleanup).not.toHaveBeenCalled();
    });

    it('引擎初始化失败则不再继续碰它（不在状态未定时删文件）', async () => {
        mockSetup.mockRejectedValueOnce(new Error('boom'));

        await expect(new Download(deps).setup()).resolves.toBeUndefined();

        expect(mockCleanup).not.toHaveBeenCalled();
    });

    it('清理失败不外抛（尽力而为，不拖垮启动）', async () => {
        mockCleanup.mockRejectedValueOnce(new Error('boom'));

        await expect(new Download(deps).setup()).resolves.toBeUndefined();
    });

    it('重复调用复用同一次启动，不重复扫盘', async () => {
        const download = new Download(deps);

        await Promise.all([download.setup(), download.setup()]);
        await download.setup();

        expect(mockSetup).toHaveBeenCalledTimes(1);
        expect(mockCleanup).toHaveBeenCalledTimes(1);
    });

    it('事件订阅在与原生对账之前装好（对账期间就可能来事件）', async () => {
        const order: string[] = [];
        jest.mocked(downloadEngine.onComplete).mockImplementation(() => {
            order.push('subscribe');
            return () => undefined;
        });
        jest.mocked(downloadEngine.getActiveTasks).mockImplementation(
            async () => {
                order.push('adopt');
                return [];
            },
        );

        await new Download(deps).setup();

        expect(order).toEqual(['subscribe', 'adopt']);
    });
});

describe('不支持下载的平台', () => {
    it('直接返回，不碰引擎（iOS 无实现）', async () => {
        jest.resetModules();
        jest.doMock('@/native/downloadEngine', () => ({
            isDownloadEngineSupported: false,
            DownloadConflictStrategy: { Rename: 'rename' },
            downloadEngine: {
                setup: jest.fn(),
                cleanupOrphans: jest.fn(),
                onComplete: jest.fn(),
            },
        }));
        // 重取模块而非动态 import：本仓 jest 未开 vm-modules
        const { Download: Isolated } = require('.') as typeof import('.');
        const engine =
            require('@/native/downloadEngine') as typeof import('@/native/downloadEngine');

        await expect(new Isolated(deps).setup()).resolves.toBeUndefined();

        expect(engine.downloadEngine.setup).not.toHaveBeenCalled();
        expect(engine.downloadEngine.cleanupOrphans).not.toHaveBeenCalled();
    });
});
