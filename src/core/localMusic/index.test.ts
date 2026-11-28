/**
 * 删文件的对外契约：删盘结果 + 广播「文件已删除」
 *
 * 事件是解耦的必要配套（设计 §6）：`localMusic` 不得知道 `download` 存在，
 * 而每个 UI 删除入口都自己去清下载记录的话，漏一个就是悬空记录
 */
import { AudioTagStatus, TagError } from '@/infra/audioTags';

import { localRefOfPath } from './localFileTransform';

import { LocalMusic } from '.';

import type { LocalLibrary } from './types';
import type { IMediaMeta } from '@/core/mediaMeta';
import type { MusicItem } from '@/types';

const mockUnlink = jest.fn(async (_path: string) => undefined);
const mockExists = jest.fn(async (_path: string) => false);

jest.mock('@dr.pogodin/react-native-fs', () => ({
    exists: (path: string) => mockExists(path),
    unlink: (path: string) => mockUnlink(path),
}));

// 下列模块在 import 期就要碰原生 / MMKV，与本组用例无关，给最小替身
const mockSetObject = jest.fn((..._args: unknown[]) => true);
const mockGetObject = jest.fn(
    (_store: unknown, _key: string): unknown => undefined,
);
jest.mock('@/infra/storage', () => ({
    getObject: (store: unknown, key: string) => mockGetObject(store, key),
    getOrCreateMMKV: () => ({}),
    setObject: (...args: unknown[]) => mockSetObject(...args),
}));
const mockReadTags = jest.fn(
    (_path: string): Promise<unknown> =>
        Promise.reject(new Error('readTags not configured')),
);
jest.mock('@/infra/audioTags', () => {
    const actual = jest.requireActual('@/infra/audioTags');
    return {
        AudioTagStatus: actual.AudioTagStatus,
        TagError: actual.TagError,
        resolveCover: () => undefined,
        readTags: (path: string) => mockReadTags(path),
    };
});
const mockFindReadableFilePath = jest.fn(
    (_location: string): Promise<string | null> => Promise.resolve(null),
);
jest.mock('@/infra/sharedStorage', () => ({
    findReadableFilePath: (location: string) =>
        mockFindReadableFilePath(location),
}));
interface FakeVolume {
    path: string;
    isMounted: boolean;
}
const mockGetStorageVolumes = jest.fn(
    (): Promise<FakeVolume[]> =>
        Promise.resolve([{ path: '/storage/emulated/0', isMounted: true }]),
);
// 真实 infra 会吞掉桥故障并回空数组，替身照此语义（core 不再自己 catch）
jest.mock('@/infra/storageVolumes', () => ({
    PRIMARY_STORAGE_ROOT: '/storage/emulated/0',
    getMountedVolumeRoots: async () => {
        try {
            const volumes = await mockGetStorageVolumes();
            return volumes.filter(v => v.isMounted).map(v => v.path);
        } catch {
            return [];
        }
    },
}));
// index 末尾 re-export hooks，而 hooks 顶层 import react-native-mmkv（ESM，jest 不转译）
jest.mock('react-native-mmkv', () => ({ useMMKVObject: () => [undefined] }));
const mockCheckStorageReadAccess = jest.fn(async () => 'granted' as const);
jest.mock('@/infra/permission', () => ({
    checkStorageReadAccess: () => mockCheckStorageReadAccess(),
    openStorageSettings: () => undefined,
    requestStorageReadAccess: () => undefined,
    requestStorageWriteAccess: () => undefined,
}));
const mockNativeStartScan = jest.fn((_options: unknown) => undefined);
const mockOnScanProgress = jest.fn((_cb: (e: never) => void) => ({
    remove: () => undefined,
}));
const mockOnScanComplete = jest.fn((_cb: (e: never) => void) => ({
    remove: () => undefined,
}));
const mockNativeCancelScan = jest.fn((_scanId: number) => undefined);
jest.mock('@/native/mediaScanner', () => ({
    isMediaScannerSupported: true,
    cancelScan: (scanId: number) => mockNativeCancelScan(scanId),
    startScan: (options: unknown) => mockNativeStartScan(options),
    onScanComplete: (cb: never) => mockOnScanComplete(cb),
    onScanError: () => ({ remove: () => undefined }),
    onScanProgress: (cb: never) => mockOnScanProgress(cb),
}));

let library: LocalLibrary;
jest.mock('./store', () => ({
    getLibrary: () => mockLibrary(),
    setLibrary: (next: LocalLibrary) => {
        mockSetLibrary(next);
    },
    resetLibrary: () => undefined,
    getScanProgress: () => ({
        status: 'scanning',
        found: 0,
        processed: 0,
        total: 0,
        currentPath: '',
    }),
    setScanProgress: (next: unknown) => mockSetScanProgress(next),
    validateSort: () => undefined,
    libraryAtom: {},
    scanProgressAtom: {},
    scanStatusAtom: {},
}));

const mockSetScanProgress = jest.fn((_next: unknown) => undefined);

/** jest.mock 工厂被提升到变量初始化之前，故经函数惰性取 */
const mockLibrary = () => library;
const mockSetLibrary = (next: LocalLibrary) => {
    library = next;
};

/** 冲刷微任务：startScan 同步认领代次、await 卷列表后才调原生 */
const flushScanLaunch = () =>
    new Promise<void>(resolve => setImmediate(resolve));

const itemAt = (path: string): MusicItem =>
    ({ platform: 'demo', id: path, title: path } as unknown as MusicItem);

function seed(paths: readonly string[]): void {
    library = {
        version: 1,
        musicByPath: Object.fromEntries(paths.map(p => [p, itemAt(p)])),
        files: Object.fromEntries(
            paths.map(p => [
                p,
                {
                    mtimeMs: 1,
                    sizeBytes: 1,
                    addedAt: 1,
                    hasCoverArt: false,
                    albumArtist: '',
                    folderPath: '/dl',
                },
            ]),
        ),
    } as unknown as LocalLibrary;
}

/** 当前下载落盘位置；默认 = app 私有默认目录 /dl，用例可改 */
const mockDownloadDir = { path: '/dl', isAppPrivate: true };

const mediaMeta = {
    clearLocalFile: jest.fn(),
    getLocalFiles: jest.fn<
        ReturnType<IMediaMeta['getLocalFiles']>,
        Parameters<IMediaMeta['getLocalFiles']>
    >(() => []),
    hasLocalFile: jest.fn<boolean, [unknown]>(() => false),
    setLocalPath: jest.fn(),
} as unknown as IMediaMeta;

const deps = {
    mediaMeta,
    getDownloadTarget: () => ({
        dir: mockDownloadDir.path,
        isAppPrivate: mockDownloadDir.isAppPrivate,
    }),
    getLocale: () => 'zh-CN' as const,
};

beforeEach(() => {
    mockDownloadDir.path = '/dl';
    mockDownloadDir.isAppPrivate = true;
    jest.clearAllMocks();
    jest.mocked(mediaMeta.getLocalFiles).mockReset().mockReturnValue([]);
    jest.mocked(mediaMeta.hasLocalFile).mockReset().mockReturnValue(false);
    mockGetObject.mockReturnValue(undefined);
    // clearAllMocks 只清调用记录、不清实现，故显式复位（默认：只有已挂载的内置存储）
    mockGetStorageVolumes.mockResolvedValue([
        { path: '/storage/emulated/0', isMounted: true },
    ]);
    mockCheckStorageReadAccess.mockResolvedValue('granted');
    mockUnlink.mockResolvedValue(undefined);
    mockExists.mockResolvedValue(false); // 删完不复存在 = 删除成功
    seed([]);
});

describe('扫描设置的默认排除目录', () => {
    const defaults = [
        '/storage/emulated/0/Recordings',
        '/storage/emulated/0/Record',
        '/storage/emulated/0/Sounds',
        '/storage/emulated/0/MIUI/sound_recorder',
        '/storage/emulated/0/Music/Recordings',
        '/storage/emulated/0/录音',
    ];

    it('从未保存过设置：排除各家 ROM 的录音目录', () => {
        mockGetObject.mockReturnValue(undefined);
        expect(new LocalMusic(deps).getScanSettings().excludedDirs).toEqual(
            defaults,
        );
    });

    it('用户清空过排除（存的是 []）：尊重空，不再塞默认', () => {
        mockGetObject.mockImplementation((_store, key) =>
            key === 'scanSettings' ? { excludedDirs: [] } : undefined,
        );
        expect(new LocalMusic(deps).getScanSettings().excludedDirs).toEqual([]);
    });

    it('用户自己的排除列表原样保留', () => {
        mockGetObject.mockImplementation((_store, key) =>
            key === 'scanSettings'
                ? { excludedDirs: ['/sdcard/Podcasts/'] }
                : undefined,
        );
        expect(new LocalMusic(deps).getScanSettings().excludedDirs).toEqual([
            '/sdcard/Podcasts',
        ]);
    });

    it('旧设置对象没有 excludedDirs 字段：按首装补默认，其余字段照旧', () => {
        mockGetObject.mockImplementation((_store, key) =>
            key === 'scanSettings' ? { minDurationSec: 60 } : undefined,
        );
        const settings = new LocalMusic(deps).getScanSettings();
        expect(settings.minDurationSec).toBe(60);
        expect(settings.excludedDirs).toEqual(defaults);
    });

    it('默认排除都在主存储根之下：全盘扫描的根不会被摘空', async () => {
        mockGetObject.mockReturnValue(undefined);
        const localMusic = new LocalMusic(deps);

        localMusic.startScan();
        await flushScanLaunch();

        const roots = (
            mockNativeStartScan.mock.calls.at(-1)?.[0] as { roots: string[] }
        ).roots;
        expect(roots).toContain('/storage/emulated/0');
    });

    it('首次只改别的字段：默认排除随之落盘，后续读到的是同一份', () => {
        mockGetObject.mockReturnValue(undefined);
        const localMusic = new LocalMusic(deps);
        localMusic.setScanSettings({ minDurationSec: 60 });
        const saved = mockSetObject.mock.calls.at(-1)?.[2] as {
            excludedDirs: string[];
            minDurationSec: number;
        };
        expect(saved.minDurationSec).toBe(60);
        expect(saved.excludedDirs).toEqual(defaults);
    });
});

describe('下载完成后加入本地音乐的设置', () => {
    it.each([undefined, {}, { minDurationSec: 60 }])(
        '未设置开关时默认开启：%p',
        stored => {
            mockGetObject.mockImplementation((_store, key) =>
                key === 'scanSettings' ? stored : undefined,
            );
            expect(
                new LocalMusic(deps).getScanSettings().includeDownloadDir,
            ).toBe(true);
        },
    );

    it('保留用户明确关闭的选择', () => {
        mockGetObject.mockImplementation((_store, key) =>
            key === 'scanSettings' ? { includeDownloadDir: false } : undefined,
        );
        expect(new LocalMusic(deps).getScanSettings().includeDownloadDir).toBe(
            false,
        );
    });

    it.each([true, false])('保存扫描范围保留下载开关当前值：%s', enabled => {
        mockGetObject.mockImplementation((_store, key) =>
            key === 'scanSettings'
                ? { includeDownloadDir: enabled }
                : undefined,
        );
        new LocalMusic(deps).setScanSettings({ minDurationSec: 60 });
        expect(mockSetObject.mock.calls.at(-1)?.[2]).toMatchObject({
            minDurationSec: 60,
            includeDownloadDir: enabled,
        });
    });
});

describe('删除文件后广播', () => {
    it('广播实际删掉的路径', async () => {
        seed(['/dl/a.mp3', '/dl/b.mp3']);
        const localMusic = new LocalMusic(deps);
        const heard: string[][] = [];
        localMusic.subscribeFilesDeleted(paths => heard.push([...paths]));

        await localMusic.deleteFilesAt(['/dl/a.mp3', '/dl/b.mp3']);

        expect(heard).toEqual([['/dl/a.mp3', '/dl/b.mp3']]);
    });

    it('删不掉的路径不出现在事件里', async () => {
        seed(['/dl/a.mp3', '/dl/b.mp3']);
        // b 删完仍在 = 删除失败
        mockExists.mockImplementation(async path => path === '/dl/b.mp3');
        const localMusic = new LocalMusic(deps);
        const heard: string[][] = [];
        localMusic.subscribeFilesDeleted(paths => heard.push([...paths]));

        await localMusic.deleteFilesAt(['/dl/a.mp3', '/dl/b.mp3']);

        expect(heard).toEqual([['/dl/a.mp3']]);
    });

    it('一个都没删成时不广播（省掉一次无谓的全库扫查）', async () => {
        seed(['/dl/a.mp3']);
        mockExists.mockResolvedValue(true);
        const localMusic = new LocalMusic(deps);
        const heard: string[][] = [];
        localMusic.subscribeFilesDeleted(paths => heard.push([...paths]));

        await localMusic.deleteFilesAt(['/dl/a.mp3']);

        expect(heard).toEqual([]);
    });

    it('退订后不再收到', async () => {
        seed(['/dl/a.mp3', '/dl/b.mp3']);
        const localMusic = new LocalMusic(deps);
        const heard: string[][] = [];
        const unsubscribe = localMusic.subscribeFilesDeleted(paths =>
            heard.push([...paths]),
        );

        await localMusic.deleteFilesAt(['/dl/a.mp3']);
        unsubscribe();
        await localMusic.deleteFilesAt(['/dl/b.mp3']);

        expect(heard).toEqual([['/dl/a.mp3']]);
    });

    it('某个订阅者抛错不影响其它订阅者', async () => {
        seed(['/dl/a.mp3']);
        const localMusic = new LocalMusic(deps);
        const heard: string[][] = [];
        localMusic.subscribeFilesDeleted(() => {
            throw new Error('boom');
        });
        localMusic.subscribeFilesDeleted(paths => heard.push([...paths]));

        await expect(
            localMusic.deleteFilesAt(['/dl/a.mp3']),
        ).resolves.toMatchObject({ deleted: 1 });
        expect(heard).toEqual([['/dl/a.mp3']]);
    });

    it('回调跑到时库里已经没有那条了', async () => {
        seed(['/dl/a.mp3']);
        const localMusic = new LocalMusic(deps);
        let seenInLibrary: boolean | undefined;
        localMusic.subscribeFilesDeleted(() => {
            seenInLibrary = '/dl/a.mp3' in library.musicByPath;
        });

        await localMusic.deleteFilesAt(['/dl/a.mp3']);

        expect(seenInLibrary).toBe(false);
    });

    it('按 ref 删除同样广播（UI 走的是这条路）', async () => {
        seed(['/dl/a.mp3']);
        const localMusic = new LocalMusic(deps);
        const heard: string[][] = [];
        localMusic.subscribeFilesDeleted(paths => heard.push([...paths]));

        await localMusic.deleteFiles([{ platform: 'demo', id: '/dl/a.mp3' }]);

        expect(heard).toEqual([['/dl/a.mp3']]);
    });

    it('库里没有时回退到播放锚点取路径', async () => {
        seed([]); // 用户清空过音乐库 / 把它从库里移除过
        jest.mocked(mediaMeta.getLocalFiles).mockReturnValueOnce([
            { path: '/dl/a.mp3' },
        ]);
        const localMusic = new LocalMusic(deps);
        const heard: string[][] = [];
        localMusic.subscribeFilesDeleted(paths => heard.push([...paths]));

        await localMusic.deleteFiles([{ platform: 'demo', id: 'x' }]);

        expect(mockUnlink).toHaveBeenCalledWith('/dl/a.mp3');
        expect(heard).toEqual([['/dl/a.mp3']]);
    });

    it('库里没有时只删除元数据首项，不扩展为删除全部候选', async () => {
        seed([]);
        jest.mocked(mediaMeta.getLocalFiles).mockReturnValueOnce([
            { path: '/dl/a.mp3' },
            { path: '/music/copy.mp3' },
        ]);
        const localMusic = new LocalMusic(deps);

        await localMusic.deleteFiles([{ platform: 'demo', id: 'x' }]);

        expect(mockUnlink.mock.calls).toEqual([['/dl/a.mp3']]);
    });

    it('删除首项失败时不改删第二个候选', async () => {
        seed([]);
        jest.mocked(mediaMeta.getLocalFiles).mockReturnValueOnce([
            { path: '/dl/a.mp3' },
            { path: '/music/copy.mp3' },
        ]);
        mockUnlink.mockRejectedValueOnce(new Error('unable to delete'));
        mockExists.mockResolvedValue(true);
        const localMusic = new LocalMusic(deps);

        const report = await localMusic.deleteFiles([
            { platform: 'demo', id: 'x' },
        ]);

        expect(report).toMatchObject({ deleted: 0, failed: 1 });
        expect(mockUnlink.mock.calls).toEqual([['/dl/a.mp3']]);
        expect(mediaMeta.clearLocalFile).not.toHaveBeenCalled();
    });

    it('删除目标仍优先取曲库路径，不查询元数据候选', async () => {
        seed(['/music/library.mp3']);
        jest.mocked(mediaMeta.getLocalFiles).mockReturnValueOnce([
            { path: '/dl/a.mp3' },
            { path: '/music/copy.mp3' },
        ]);
        const localMusic = new LocalMusic(deps);

        await localMusic.deleteFiles([
            { platform: 'demo', id: '/music/library.mp3' },
        ]);

        expect(mockUnlink.mock.calls).toEqual([['/music/library.mp3']]);
        expect(mediaMeta.getLocalFiles).not.toHaveBeenCalled();
    });

    it('库与锚点都找不到时报 notFound，不碰磁盘', async () => {
        seed([]);
        const localMusic = new LocalMusic(deps);
        const heard: string[][] = [];
        localMusic.subscribeFilesDeleted(paths => heard.push([...paths]));

        const report = await localMusic.deleteFiles([
            { platform: 'demo', id: 'x' },
        ]);

        expect(mockUnlink).not.toHaveBeenCalled();
        expect(report.failures).toEqual([{ code: 'notFound' }]);
        expect(heard).toEqual([]);
    });

    it('清锚点抛错也照样广播（否则文件没了、下载记录还悬着）', async () => {
        seed(['/dl/a.mp3']);
        jest.mocked(mediaMeta.clearLocalFile).mockImplementationOnce(() => {
            throw new Error('mmkv boom');
        });
        const localMusic = new LocalMusic(deps);
        const heard: string[][] = [];
        localMusic.subscribeFilesDeleted(paths => heard.push([...paths]));

        await localMusic.deleteFilesAt(['/dl/a.mp3']);

        expect(heard).toEqual([['/dl/a.mp3']]);
    });

    it('分发期间新加的订阅者不收本次事件', async () => {
        seed(['/dl/a.mp3']);
        const localMusic = new LocalMusic(deps);
        const late: string[][] = [];
        localMusic.subscribeFilesDeleted(() => {
            localMusic.subscribeFilesDeleted(paths => late.push([...paths]));
        });

        await localMusic.deleteFilesAt(['/dl/a.mp3']);

        expect(late).toEqual([]);
    });
});

describe('删盘期间路径被回收', () => {
    // 删盘按 8 个一批；把 a 放在第一批、到第二批才顶替它，
    // 才是真实的危险窗口：a 已 unlink 且复核过不存在，收尾却还没跑
    const many = Array.from({ length: 9 }, (_, i) => `/dl/f${i}.mp3`);
    const recycled = many[0]!;
    const plain = many[8]!;

    function replaceOnSecondBatch(): void {
        mockUnlink.mockImplementation(async path => {
            if (path === plain) {
                // 第二批才跑到这里：此时 a 已删完并复核过
                library.musicByPath[recycled] = itemAt('reborn');
                library.files[recycled] = { ...library.files[recycled]! };
            }
            return undefined;
        });
    }

    it('库里那条已被换掉时不移除、不清锚点', async () => {
        seed(many);
        const localMusic = new LocalMusic(deps);
        replaceOnSecondBatch();

        await localMusic.deleteFilesAt(many);

        expect(recycled in library.musicByPath).toBe(true);
        expect(plain in library.musicByPath).toBe(false);
        expect(mediaMeta.clearLocalFile).not.toHaveBeenCalledWith(
            expect.anything(),
            recycled,
        );
        expect(mediaMeta.clearLocalFile).toHaveBeenCalledWith(
            expect.anything(),
            plain,
        );
    });

    it('被换掉的那条不广播（那个路径上现在躺着别人的文件）', async () => {
        seed(many);
        const localMusic = new LocalMusic(deps);
        const heard: string[][] = [];
        localMusic.subscribeFilesDeleted(paths => heard.push([...paths]));
        replaceOnSecondBatch();

        await localMusic.deleteFilesAt(many);

        expect(heard[0]).not.toContain(recycled);
        expect(heard[0]).toContain(plain);
    });

    it('报给调用方的删除数仍按实际删掉的文件算', async () => {
        seed(many);
        const localMusic = new LocalMusic(deps);
        replaceOnSecondBatch();

        const report = await localMusic.deleteFilesAt(many);

        expect(report.deleted).toBe(many.length);
    });

    it('库里没有该 path 时，用调用方带来的身份清锚点', async () => {
        seed([]); // 清空过音乐库
        jest.mocked(mediaMeta.getLocalFiles).mockReturnValueOnce([
            { path: '/dl/a.mp3' },
        ]);
        const ref = { platform: 'demo', id: 'x' };
        const localMusic = new LocalMusic(deps);

        await localMusic.deleteFiles([ref]);

        expect(mediaMeta.clearLocalFile).toHaveBeenCalledWith(ref, '/dl/a.mp3');
    });
});

/**
 * 全盘扫描的根：设备可能有多个存储卷（内置 + SD 卡）
 *
 * 原生按「known 里不在任何 root 之下」判定条目已消失。全盘模式没有「范围之外」，
 * 出现这种路径只说明那个卷这次没枚举到（卡拔了 / 系统漏报 / 取卷失败），
 * 故 core 侧设护栏：全盘模式只认落在本次实际扫过的根之下的删除
 */
describe('全盘扫描的存储卷根', () => {
    const VOLUME = {
        primary: { path: '/storage/emulated/0', isMounted: true },
        sd: { path: '/storage/1A2B-3C4D', isMounted: true },
    };

    /** 按 key 供 MMKV 读取（本组只用 scanSettings） */
    function withStore(values: Record<string, unknown>): void {
        mockGetObject.mockImplementation((_store, key) => values[key]);
    }

    const rootsOf = () =>
        (mockNativeStartScan.mock.calls.at(-1)?.[0] as { roots: string[] })
            .roots;

    const optionsOf = () =>
        mockNativeStartScan.mock.calls.at(-1)?.[0] as {
            legacyTagCharset: string;
            knownFingerprintsJson: string;
        };

    /*
     * 这三条钉的是「特性与现实之间唯一的那条接线」：
     * getLocale → legacyTagCharsetFor → 扫描入参。纯函数各自有测，接线断了却测不出来
     */
    it('把按语言选出的码表传进扫描入参', async () => {
        withStore({ scanSettings: { mode: 'all' } });
        mockGetStorageVolumes.mockResolvedValue([VOLUME.primary]);
        const localMusic = new LocalMusic(deps);
        localMusic.startScan();
        await flushScanLaunch();
        // deps.getLocale 固定 zh-CN
        expect(optionsOf().legacyTagCharset).toBe('GBK');
    });

    /*
     * 码表变了（含升级前入的库：tagCharset 缺失）必须放弃增量，否则已入库的乱码
     * 永远修不掉——指纹只看 mtime:size，老文件不会变
     */
    it('文件没记过码表时那一条不吃增量：值清空、path 保留', async () => {
        withStore({ scanSettings: { mode: 'all' } });
        // 升级前入的库：文件元数据里没有 tagCharset
        library = {
            version: 1,
            musicByPath: { '/a.mp3': itemAt('/a.mp3') },
            files: {
                '/a.mp3': {
                    mtimeMs: 1,
                    sizeBytes: 2,
                    addedAt: 1,
                    hasCoverArt: false,
                    albumArtist: '',
                    folderPath: '/',
                },
            },
        } as unknown as LocalLibrary;
        mockGetStorageVolumes.mockResolvedValue([VOLUME.primary]);
        const localMusic = new LocalMusic(deps);
        localMusic.startScan();
        await flushScanLaunch();
        const known = JSON.parse(optionsOf().knownFingerprintsJson);
        // key 必须留着：原生的 removedPaths 就是遍历这张表的 key 算的
        expect(Object.keys(known)).toEqual(['/a.mp3']);
        // 值清空 → 原生按 "mtime:size" 比不中 → 全部重读
        expect(known['/a.mp3']).toBe('');
    });

    it('码表与上次一致时照常吃增量', async () => {
        withStore({ scanSettings: { mode: 'all' } });
        library = {
            version: 1,
            musicByPath: { '/a.mp3': itemAt('/a.mp3') },
            files: {
                // 戳在**文件**上，不是库上
                '/a.mp3': {
                    mtimeMs: 1,
                    sizeBytes: 2,
                    addedAt: 1,
                    hasCoverArt: false,
                    albumArtist: '',
                    folderPath: '/',
                    tagCharset: 'GBK',
                },
            },
        } as unknown as LocalLibrary;
        mockGetStorageVolumes.mockResolvedValue([VOLUME.primary]);
        const localMusic = new LocalMusic(deps);
        localMusic.startScan();
        await flushScanLaunch();
        expect(JSON.parse(optionsOf().knownFingerprintsJson)['/a.mp3']).toBe(
            '1:2',
        );
    });

    it('已挂载的 SD 卡进 roots', async () => {
        withStore({ scanSettings: { mode: 'all' } });
        mockGetStorageVolumes.mockResolvedValue([VOLUME.primary, VOLUME.sd]);
        const localMusic = new LocalMusic(deps);

        localMusic.startScan();
        await flushScanLaunch();

        expect(rootsOf()).toContain('/storage/1A2B-3C4D');
    });

    it('未挂载的卷不进 roots（扫不了，也不必扫）', async () => {
        withStore({ scanSettings: { mode: 'all' } });
        mockGetStorageVolumes.mockResolvedValue([
            VOLUME.primary,
            { ...VOLUME.sd, isMounted: false },
        ]);
        const localMusic = new LocalMusic(deps);

        localMusic.startScan();
        await flushScanLaunch();

        expect(rootsOf()).not.toContain('/storage/1A2B-3C4D');
    });

    it('卷列表取不到时仍保住主存储根（漏根会被差量结算判成整库消失）', async () => {
        withStore({ scanSettings: { mode: 'all' } });
        mockGetStorageVolumes.mockRejectedValue(new Error('bridge down'));
        const localMusic = new LocalMusic(deps);

        localMusic.startScan();
        await flushScanLaunch();

        // 末尾的 /dl 是下载目录（「下载完成后加入本地音乐」默认开 → 一并扫）
        expect(rootsOf()).toEqual(['/storage/emulated/0', '/dl']);
    });

    it('所有根都被排除：就地报失败，不把空 roots 递给原生', async () => {
        withStore({
            scanSettings: {
                mode: 'all',
                excludedDirs: ['/storage/emulated/0'],
                includeDownloadDir: false,
            },
        });
        mockGetStorageVolumes.mockResolvedValue([VOLUME.primary]);
        const localMusic = new LocalMusic(deps);

        localMusic.startScan();
        await flushScanLaunch();

        expect(mockNativeStartScan).not.toHaveBeenCalled();
        expect(mockSetScanProgress).toHaveBeenLastCalledWith(
            expect.objectContaining({ status: 'failed', errorCode: 'E_IO' }),
        );
    });

    it('排除项盖住下载目录的祖先时，下载目录也不当 root 硬塞回来', async () => {
        withStore({
            scanSettings: {
                mode: 'all',
                excludedDirs: ['/dl'],
                includeDownloadDir: true,
            },
        });
        mockGetStorageVolumes.mockResolvedValue([VOLUME.primary]);
        const localMusic = new LocalMusic(deps);

        localMusic.startScan();
        await flushScanLaunch();

        expect(rootsOf()).toEqual(['/storage/emulated/0']);
    });

    it('custom 模式：用户把下载目录加成扫描目录就照扫（开关关掉也不撤这个根）', async () => {
        mockDownloadDir.path = '/storage/x/MF';
        mockDownloadDir.isAppPrivate = false;
        withStore({
            scanSettings: {
                mode: 'custom',
                includedDirs: ['/dl', '/storage/emulated/0/Music'],
                includeDownloadDir: false,
            },
        });
        const localMusic = new LocalMusic(deps);

        localMusic.startScan();
        await flushScanLaunch();

        expect(rootsOf()).toEqual(['/dl', '/storage/emulated/0/Music']);
    });

    it('开关开着但下载目录被显式排除：那个根不扫，库里下载目录的旧条目也照清', async () => {
        seed(['/dl/old.mp3', '/storage/emulated/0/Music/keep.mp3']);
        withStore({
            scanSettings: {
                mode: 'all',
                excludedDirs: ['/dl'],
                includeDownloadDir: true,
            },
        });
        const localMusic = new LocalMusic(deps);

        localMusic.startScan();
        await flushScanLaunch();
        (mockOnScanComplete.mock.calls.at(-1)?.[0] as (e: unknown) => void)({
            scanId: (
                mockNativeStartScan.mock.calls.at(-1)?.[0] as {
                    scanId: number;
                }
            ).scanId,
            removedPaths: [],
            failedPaths: [],
            tagsRead: 0,
            reused: 0,
        });

        expect(library.musicByPath['/dl/old.mp3']).toBeUndefined();
        expect(
            library.musicByPath['/storage/emulated/0/Music/keep.mp3'],
        ).toBeDefined();
    });

    it('新扫描一认领就先停掉原生上一轮（等卷列表这段窗口里它本无人认领）', async () => {
        withStore({ scanSettings: { mode: 'all' } });
        const localMusic = new LocalMusic(deps);
        localMusic.startScan();
        await flushScanLaunch();
        const firstScanId = (
            mockNativeStartScan.mock.calls[0]?.[0] as { scanId: number }
        ).scanId;

        localMusic.startScan();

        expect(mockNativeCancelScan).toHaveBeenCalledWith(firstScanId);
    });

    it('取消后卷列表才回来：不再启动原生扫描', async () => {
        withStore({ scanSettings: { mode: 'all' } });
        mockGetStorageVolumes.mockResolvedValue([VOLUME.primary]);
        const localMusic = new LocalMusic(deps);

        localMusic.startScan();
        localMusic.cancelScan(); // 卷列表尚未回来
        await flushScanLaunch();

        expect(mockNativeStartScan).not.toHaveBeenCalled();
    });

    describe('删除结算护栏', () => {
        const SD_SONG = '/storage/1A2B-3C4D/Music/a.mp3';
        const INTERNAL_SONG = '/storage/emulated/0/Music/b.mp3';

        /** 原生完成事件：removedPaths 由调用方给（原生会把「不在任何 root 之下」的也算进来） */
        const emitComplete = (removedPaths: string[]) =>
            (mockOnScanComplete.mock.calls.at(-1)?.[0] as (e: unknown) => void)(
                {
                    scanId: (
                        mockNativeStartScan.mock.calls.at(-1)?.[0] as {
                            scanId: number;
                        }
                    ).scanId,
                    removedPaths,
                    failedPaths: [],
                    tagsRead: 0,
                    reused: 0,
                },
            );

        it('全盘：卡拔了这一趟没扫到它，卡上的旧条目不许被删', async () => {
            seed([SD_SONG, INTERNAL_SONG]);
            withStore({ scanSettings: { mode: 'all' } });
            mockGetStorageVolumes.mockResolvedValue([VOLUME.primary]);
            const localMusic = new LocalMusic(deps);

            localMusic.startScan();
            await flushScanLaunch();
            emitComplete([SD_SONG, INTERNAL_SONG]);

            expect(library.musicByPath[SD_SONG]).toBeDefined();
            // 内置存储这次实扫了，它报删就是真删
            expect(library.musicByPath[INTERNAL_SONG]).toBeUndefined();
        });

        it('用户明确排除的目录照清——哪怕原生一条 removedPaths 都没报', async () => {
            // 原生对「列不出来的目录」会整棵标成不可信子树、其下一律不参与删除结算，
            // 故排除目录不能指望它报，得由 core 自己扫一遍
            seed([SD_SONG]);
            withStore({
                scanSettings: {
                    mode: 'all',
                    excludedDirs: ['/storage/1A2B-3C4D/Music'],
                },
            });
            mockGetStorageVolumes.mockResolvedValue([VOLUME.primary]);
            const localMusic = new LocalMusic(deps);

            localMusic.startScan();
            await flushScanLaunch();
            emitComplete([]);

            expect(library.musicByPath[SD_SONG]).toBeUndefined();
        });

        it('指定目录：范围外的旧条目照删（那是用户自己缩的范围）', async () => {
            seed([SD_SONG, INTERNAL_SONG]);
            withStore({
                scanSettings: {
                    mode: 'custom',
                    includedDirs: ['/storage/emulated/0/Music'],
                },
            });
            mockGetStorageVolumes.mockResolvedValue([VOLUME.primary]);
            const localMusic = new LocalMusic(deps);

            localMusic.startScan();
            await flushScanLaunch();
            emitComplete([SD_SONG]);

            expect(library.musicByPath[SD_SONG]).toBeUndefined();
        });
    });
});

/**
 * 「下载完成后写入本地库」开关（设计 §9）
 *
 * 轮 B 起它表达的是「下载的歌算不算我的本地音乐」：
 * 开着 = 下载入账即写进库 **且** 把当前下载目录一并纳入扫描根（只写不扫，写进去的
 * 曲目会被下一次扫描的差量结算清掉）；关掉 = 两件都不做，且不做任何反向动作——
 * 那个目录该不该扫由扫描范围自己说
 */
describe('下载完成写入本地库开关', () => {
    /** 让 getScanSettings 读到指定配置；其余 key 仍走默认 */
    function withScanSettings(patch: Record<string, unknown>): void {
        // 显式给空排除：本组用例只看下载目录的进出，不让首装默认排除掺进断言
        mockGetObject.mockImplementation((_store, key) =>
            key === 'scanSettings' ? { excludedDirs: [], ...patch } : undefined,
        );
    }

    describe('与扫描的关系', () => {
        const scanned = {
            id: 'x',
            path: '/dl/scanned.mp3',
            title: 't',
            artist: 'a',
            album: 'b',
            albumArtist: 'a',
            durationMs: 1000,
            sizeBytes: 10,
            mtimeMs: 2,
            folderPath: '/dl',
            extension: 'mp3',
            hasCoverArt: false,
            mfMusicItem: '',
        };
        const currentScanId = () =>
            (mockNativeStartScan.mock.calls.at(-1)?.[0] as { scanId: number })
                .scanId;
        const emitProgress = (batch: unknown[]) =>
            (mockOnScanProgress.mock.calls.at(-1)?.[0] as (e: unknown) => void)(
                {
                    scanId: currentScanId(),
                    batch,
                    processed: batch.length,
                    total: batch.length,
                    currentPath: '/dl',
                },
            );
        const emitComplete = () =>
            (mockOnScanComplete.mock.calls.at(-1)?.[0] as (e: unknown) => void)(
                {
                    scanId: currentScanId(),
                    removedPaths: [],
                    failedPaths: [],
                    tagsRead: 0,
                    reused: 0,
                },
            );

        it('关掉时对自定义目录不做任何反向动作：不塞 root、也不塞排除', async () => {
            mockDownloadDir.path = '/storage/x/MF';
            mockDownloadDir.isAppPrivate = false;
            withScanSettings({ mode: 'all', includeDownloadDir: false });
            const localMusic = new LocalMusic(deps);

            localMusic.startScan();
            await flushScanLaunch();

            const options = mockNativeStartScan.mock.calls[0]?.[0] as {
                roots: string[];
                excludedDirs: string[];
            };
            expect(options.roots).toEqual(['/storage/emulated/0']);
            expect(options.excludedDirs).toEqual([]);
        });

        it('开着时把下载目录一并当扫描根——否则 addFile 写进去的歌会被下次扫描清掉', async () => {
            withScanSettings({ mode: 'custom', includedDirs: ['/music'] });
            const localMusic = new LocalMusic(deps);

            localMusic.startScan();
            await flushScanLaunch();

            const options = mockNativeStartScan.mock.calls[0]?.[0] as {
                roots: string[];
            };
            // 末尾：原生 LIFO 出栈，嵌在别的 root 子树里的专用 root 要排在后面
            expect(options.roots).toEqual(['/music', '/dl']);
        });

        it('自定义下载目录同样跟着走（取值现问 core/download）', async () => {
            mockDownloadDir.path = '/storage/emulated/0/Music/MF';
            mockDownloadDir.isAppPrivate = false;
            withScanSettings({ mode: 'custom', includedDirs: ['/music'] });
            const localMusic = new LocalMusic(deps);

            localMusic.startScan();
            await flushScanLaunch();

            expect(
                (mockNativeStartScan.mock.calls[0]?.[0] as { roots: string[] })
                    .roots,
            ).toContain('/storage/emulated/0/Music/MF');
        });

        it('用户明确排除了下载目录：排除压过开关，那个根被摘掉', async () => {
            withScanSettings({
                mode: 'all',
                excludedDirs: ['/dl'],
                includeDownloadDir: true,
            });
            const localMusic = new LocalMusic(deps);

            localMusic.startScan();
            await flushScanLaunch();

            expect(
                (mockNativeStartScan.mock.calls[0]?.[0] as { roots: string[] })
                    .roots,
            ).toEqual(['/storage/emulated/0']);
        });

        it('关掉后：app 私有默认下载目录并进库清理（那儿系统不让枚举，不自己清就永远清不掉）', async () => {
            withScanSettings({ mode: 'all', includeDownloadDir: false });
            const localMusic = new LocalMusic(deps);

            localMusic.startScan();
            await flushScanLaunch();

            expect(
                (
                    mockNativeStartScan.mock.calls[0]?.[0] as {
                        excludedDirs: string[];
                    }
                ).excludedDirs,
            ).toEqual(['/dl']);
        });

        it('关掉后：自定义下载目录不清——它可能就是用户的普通音乐文件夹', async () => {
            mockDownloadDir.path = '/storage/emulated/0/Music';
            mockDownloadDir.isAppPrivate = false;
            withScanSettings({ mode: 'all', includeDownloadDir: false });
            const localMusic = new LocalMusic(deps);

            localMusic.startScan();
            await flushScanLaunch();

            expect(
                (
                    mockNativeStartScan.mock.calls[0]?.[0] as {
                        excludedDirs: string[];
                    }
                ).excludedDirs,
            ).toEqual([]);
        });

        it('关掉后，自定义下载目录里被扫到的文件照样进库（写入开关不剪扫描结果）', async () => {
            mockDownloadDir.path = '/storage/x/MF';
            mockDownloadDir.isAppPrivate = false;
            withScanSettings({ mode: 'all', includeDownloadDir: false });
            const localMusic = new LocalMusic(deps);

            localMusic.startScan();
            await flushScanLaunch();
            emitProgress([scanned]);
            emitComplete();

            expect(library.musicByPath['/dl/scanned.mp3']).toBeDefined();
        });
    });

    describe('写入侧', () => {
        const downloaded = {
            item: itemAt('/dl/new.mp3'),
            path: '/dl/new.mp3',
            sizeBytes: 100,
            addedAt: 1,
        };

        it('开着时下载完成写入本地库', () => {
            withScanSettings({ mode: 'all' });
            const localMusic = new LocalMusic(deps);

            localMusic.addFile(downloaded);

            expect(library.musicByPath['/dl/new.mp3']).toBeDefined();
        });

        it('关掉后下载完成不入库', () => {
            withScanSettings({ mode: 'all', includeDownloadDir: false });
            const localMusic = new LocalMusic(deps);

            localMusic.addFile(downloaded);

            expect(library.musicByPath['/dl/new.mp3']).toBeUndefined();
        });

        it('开着但文件落在用户排除的目录里：不写（否则写进去、下次扫描又清掉）', () => {
            withScanSettings({
                mode: 'all',
                includeDownloadDir: true,
                excludedDirs: ['/dl'],
            });
            const localMusic = new LocalMusic(deps);

            localMusic.addFile(downloaded);

            expect(library.musicByPath['/dl/new.mp3']).toBeUndefined();
        });

        it('关掉后与文件落在哪无关——自定义下载目录同样不写', () => {
            withScanSettings({ mode: 'all', includeDownloadDir: false });
            const localMusic = new LocalMusic(deps);

            localMusic.addFile({
                ...downloaded,
                path: '/storage/emulated/0/Music/new.mp3',
            });

            expect(
                library.musicByPath['/storage/emulated/0/Music/new.mp3'],
            ).toBeUndefined();
        });
    });
});

describe('外部打开的文件解析', () => {
    const snapshot = (fields: Record<string, string[]>) => ({
        fields,
        durationMs: 200_000,
        bitrateKbps: 320,
        sampleRateHz: 44_100,
        channels: 2,
        hasCoverArt: false,
    });

    it('定位不到真实路径时不给条目', async () => {
        mockFindReadableFilePath.mockResolvedValue(null);
        const localMusic = new LocalMusic(deps);

        await expect(
            localMusic.resolveMusicFile('content://cloud/song'),
        ).resolves.toBeNull();
        expect(mockReadTags).not.toHaveBeenCalled();
        expect(mediaMeta.setLocalPath).not.toHaveBeenCalled();
    });

    it('扩展名不在音频白名单时不给条目（.js 等入口不会被当成音乐）', async () => {
        mockFindReadableFilePath.mockResolvedValue('/sd/plugin.js');
        const localMusic = new LocalMusic(deps);

        await expect(
            localMusic.resolveMusicFile('content://x/plugin.js'),
        ).resolves.toBeNull();
        expect(mockReadTags).not.toHaveBeenCalled();
    });

    it('用 tag 组装条目，身份取自 canonical 路径', async () => {
        mockFindReadableFilePath.mockResolvedValue('/sd/Music/a.mp3');
        mockReadTags.mockResolvedValue(
            snapshot({ TITLE: ['标题'], ARTIST: ['歌手'], ALBUM: ['专辑'] }),
        );
        const localMusic = new LocalMusic(deps);

        const resolved = await localMusic.resolveMusicFile('content://x/1');
        const item = resolved!.item;

        expect(item).toMatchObject({
            platform: '本地',
            title: '标题',
            artist: '歌手',
            album: '专辑',
            duration: 200,
        });
        // 与扫描侧同一路径必然得到同一 id，收藏 / 历史才对得上
        expect(item.id).toBe(localRefOfPath('/sd/Music/a.mp3').id);
        expect(resolved!.path).toBe('/sd/Music/a.mp3');
        // 本地身份的音源直接取 item.url，不必写锚点
        expect(mediaMeta.setLocalPath).not.toHaveBeenCalled();
    });

    it('文件自带身份声明时以声明为准（不按路径另造一个身份）', async () => {
        const declared = {
            platform: 'demo',
            id: 'song-1',
            title: '声明里的标题',
        };
        mockFindReadableFilePath.mockResolvedValue('/sd/Music/a.mp3');
        mockReadTags.mockResolvedValue(
            snapshot({
                TITLE: ['tag 里的标题'],
                MF_MUSICITEM: [JSON.stringify({ v: 1, item: declared })],
            }),
        );
        const localMusic = new LocalMusic(deps);

        const resolved = await localMusic.resolveMusicFile('content://x/1');
        const item = resolved!.item;

        expect(item).toMatchObject(declared);
        expect(item.url).toBe('file:///sd/Music/a.mp3');
        expect(resolved!.path).toBe('/sd/Music/a.mp3');
        // 本次播放路径单独返回给 Player，不额外写成 mediaMeta 的长期锚点
        expect(mediaMeta.setLocalPath).not.toHaveBeenCalled();
    });

    it('TagLib 不认识的格式仍给条目，标题回落文件名', async () => {
        mockFindReadableFilePath.mockResolvedValue('/sd/Music/未知格式.ape');
        mockReadTags.mockRejectedValue(
            new TagError(AudioTagStatus.Unsupported),
        );
        const localMusic = new LocalMusic(deps);

        const resolved = await localMusic.resolveMusicFile('content://x/1');
        const item = resolved!.item;

        expect(item).toMatchObject({ platform: '本地', title: '未知格式' });
    });

    it.each([
        ['文件已消失', AudioTagStatus.NotFound],
        ['无读取权限', AudioTagStatus.Permission],
        ['读盘故障', AudioTagStatus.Io],
    ])('%s 时不给条目，也不写锚点', async (_name, status) => {
        mockFindReadableFilePath.mockResolvedValue('/sd/Music/a.mp3');
        mockReadTags.mockRejectedValue(new TagError(status));
        const localMusic = new LocalMusic(deps);

        await expect(
            localMusic.resolveMusicFile('content://x/1'),
        ).resolves.toBeNull();
        expect(mediaMeta.setLocalPath).not.toHaveBeenCalled();
    });

    it('桥故障（如 iOS 无 TagLib）不给条目', async () => {
        mockFindReadableFilePath.mockResolvedValue('/sd/Music/a.mp3');
        mockReadTags.mockRejectedValue(new Error('模块不可用'));
        const localMusic = new LocalMusic(deps);

        await expect(
            localMusic.resolveMusicFile('content://x/1'),
        ).resolves.toBeNull();
        expect(mediaMeta.setLocalPath).not.toHaveBeenCalled();
    });
});

describe('#674 删除文件后已下载态残留修复', () => {
    it('无 MF_MUSICITEM 文件在本地库里是「本地」身份时，从歌单按插件 ref 删除也会清掉插件锚点', async () => {
        const localItem = {
            platform: '本地',
            id: 'md5-local',
            title: 'song',
        } as unknown as MusicItem;
        library = {
            version: 1,
            musicByPath: { '/dl/untagged.aac': localItem },
            files: {
                '/dl/untagged.aac': {
                    mtimeMs: 1,
                    sizeBytes: 1,
                    addedAt: 1,
                    hasCoverArt: false,
                    albumArtist: '',
                    folderPath: '/dl',
                },
            },
        };
        const pluginRef = { platform: 'demo', id: '12345' };
        jest.mocked(mediaMeta.getLocalFiles).mockReturnValueOnce([
            { path: 'file:///dl/untagged.aac' },
        ]);
        const localMusic = new LocalMusic(deps);

        await localMusic.deleteFiles([pluginRef]);

        expect(mockUnlink).toHaveBeenCalledWith('/dl/untagged.aac');
        expect(mediaMeta.clearLocalFile).toHaveBeenCalledWith(
            localItem,
            '/dl/untagged.aac',
        );
        expect(mediaMeta.clearLocalFile).toHaveBeenCalledWith(
            pluginRef,
            '/dl/untagged.aac',
        );
    });

    it('删除当前文件后若同一曲目另一路径槽已从磁盘消失，顺手清掉悬空槽并一并广播', async () => {
        seed(['/music/moved.mp3']);
        const ref = { platform: 'demo', id: '/music/moved.mp3' };
        jest.mocked(mediaMeta.hasLocalFile).mockReturnValueOnce(true);
        jest.mocked(mediaMeta.getLocalFiles).mockReturnValueOnce([
            { path: '/dl/stale-old.mp3', quality: 'high' },
        ]);
        mockExists.mockResolvedValue(false);
        const heard: string[][] = [];
        const localMusic = new LocalMusic(deps);
        localMusic.subscribeFilesDeleted(paths => heard.push([...paths]));

        await localMusic.deleteFiles([ref]);

        expect(mediaMeta.clearLocalFile).toHaveBeenCalledWith(
            expect.objectContaining(ref),
            '/music/moved.mp3',
        );
        expect(mediaMeta.clearLocalFile).toHaveBeenCalledWith(
            expect.objectContaining(ref),
            '/dl/stale-old.mp3',
        );
        expect(heard).toEqual([['/music/moved.mp3'], ['/dl/stale-old.mp3']]);
    });

    it('另一路径槽位于已卸载的 SD 卡上时，即使 exists 返回 false 也不误清锚点或广播', async () => {
        const internalCopy = '/storage/emulated/0/Music/copy.mp3';
        const unmountedSdCopy = '/storage/1A2B-3C4D/Music/sd-copy.mp3';
        seed([internalCopy]);
        const ref = { platform: 'demo', id: internalCopy };
        mockGetStorageVolumes.mockResolvedValue([
            { path: '/storage/emulated/0', isMounted: true },
            { path: '/storage/1A2B-3C4D', isMounted: false },
        ]);
        jest.mocked(mediaMeta.hasLocalFile).mockReturnValueOnce(true);
        jest.mocked(mediaMeta.getLocalFiles).mockReturnValueOnce([
            { path: unmountedSdCopy, quality: 'high' },
        ]);
        mockExists.mockResolvedValue(false);
        const heard: string[][] = [];
        const localMusic = new LocalMusic(deps);
        localMusic.subscribeFilesDeleted(paths => heard.push([...paths]));

        await localMusic.deleteFiles([ref]);

        expect(mediaMeta.clearLocalFile).toHaveBeenCalledTimes(1);
        expect(mediaMeta.clearLocalFile).toHaveBeenCalledWith(
            expect.objectContaining(ref),
            internalCopy,
        );
        expect(heard).toEqual([[internalCopy]]);
    });

    it('另一路径槽在磁盘上真存在（确有双副本）时不误清它', async () => {
        seed(['/dl/copy1.mp3']);
        const ref = { platform: 'demo', id: '/dl/copy1.mp3' };
        jest.mocked(mediaMeta.hasLocalFile).mockReturnValueOnce(true);
        jest.mocked(mediaMeta.getLocalFiles).mockReturnValueOnce([
            { path: '/music/live-copy2.mp3' },
        ]);
        mockExists.mockImplementation(async p => p === '/music/live-copy2.mp3');
        const localMusic = new LocalMusic(deps);

        await localMusic.deleteFiles([ref]);

        expect(mediaMeta.clearLocalFile).toHaveBeenCalledTimes(1);
        expect(mediaMeta.clearLocalFile).toHaveBeenCalledWith(
            expect.objectContaining(ref),
            '/dl/copy1.mp3',
        );
    });

    it('重新扫描确认磁盘文件消失时，同步清掉 mediaMeta 锚点并广播文件已删除', async () => {
        const gonePath = '/storage/emulated/0/Music/gone.mp3';
        const filteredButAlivePath = '/storage/emulated/0/Music/short.mp3';
        seed([gonePath, filteredButAlivePath]);
        mockExists.mockImplementation(async p => p === filteredButAlivePath);
        const heard: string[][] = [];
        const localMusic = new LocalMusic(deps);
        localMusic.subscribeFilesDeleted(paths => heard.push([...paths]));

        localMusic.startScan();
        await flushScanLaunch();
        (mockOnScanComplete.mock.calls.at(-1)?.[0] as (e: unknown) => void)({
            scanId: (
                mockNativeStartScan.mock.calls.at(-1)?.[0] as { scanId: number }
            ).scanId,
            removedPaths: [gonePath, filteredButAlivePath],
            failedPaths: [],
            tagsRead: 0,
            reused: 0,
        });
        await flushScanLaunch();
        await flushScanLaunch();

        expect(mediaMeta.clearLocalFile).toHaveBeenCalledTimes(1);
        expect(mediaMeta.clearLocalFile).toHaveBeenCalledWith(
            expect.objectContaining({ platform: 'demo', id: gonePath }),
            gonePath,
        );
        expect(heard).toEqual([[gonePath]]);
    });
});
