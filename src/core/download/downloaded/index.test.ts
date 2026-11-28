/**
 * 已下载库的删除语义
 *
 * 重点是**删盘那次 await 期间发生的事**：路径会被回收（原生发布遇同名才加后缀，
 * 名字一腾出来就会被下一次下载拿去），所以「我删过这个路径」不足以证明
 * 「现在挂在这个路径上的记录该摘掉」
 */
import { DownloadedLibrary } from '.';

import type { DownloadedEntry } from './types';
import type { MusicItem } from '@/types';

/** 假的 MMKV：真库经 @/infra/storage 拉 react-native-mmkv（ESM，jest 不转译） */
const shelf = new Map<string, DownloadedEntry>();

jest.mock('./store', () => ({
    openDownloadedStore: () => ({}),
    readDownloaded: (_store: unknown, key: string) => mockShelf().get(key),
    writeDownloaded: (_store: unknown, entry: DownloadedEntry) => {
        mockShelf().set(entry.mediaKey, entry);
        return entry;
    },
    removeDownloaded: (_store: unknown, key: string) => {
        mockShelf().delete(key);
    },
    listDownloaded: () => [...mockShelf().values()],
    // 运行时镜像：真实实现里它由 MMKV 监听驱动，默认与库一致；
    // 个别用例改写 mockMirror 来造「镜像落后一个微任务」的错位
    getDownloadedEntries: () => mockMirror ?? mockShelf(),
}));

/** 非 undefined 时顶替镜像，用于造镜像与库的不一致 */
let mockMirror: Map<string, DownloadedEntry> | undefined;

/** jest.mock 工厂在 shelf 初始化前被提升，故经函数惰性取 */
function mockShelf() {
    return shelf;
}

const item = { platform: 'demo', id: 'song-1', title: 't' } as MusicItem;
const KEY = JSON.stringify(['demo', 'song-1']);
const PATH = '/dl/t.mp3';

const fileAt = (completedAt: number, sizeBytes = 10) => ({
    path: PATH,
    extension: 'mp3',
    sizeBytes,
    completedAt,
    resolvedQuality: 'high' as const,
});

const entryOf = (file: DownloadedEntry['file']): DownloadedEntry => ({
    item,
    mediaKey: KEY,
    file,
});

const mockSetDownloadData = jest.fn();
const mockClearLocalFile = jest.fn();

function makeLibrary() {
    return new DownloadedLibrary({
        mediaMeta: {
            setDownloadData: mockSetDownloadData,
            clearLocalFile: mockClearLocalFile,
        } as never,
    });
}

beforeEach(() => {
    shelf.clear();
    mockMirror = undefined;
    jest.clearAllMocks();
});

describe('下载完成入账', () => {
    it('入账到同一路径时不报 supersededPath（否则会删掉刚发布的文件）', () => {
        shelf.set(KEY, entryOf(fileAt(1000, 10)));

        const result = makeLibrary().recordFile({
            item,
            file: fileAt(2000, 20),
        });

        expect(result).toEqual({});
    });

    it('入账到新路径时交还旧路径给调用方删盘', () => {
        shelf.set(KEY, entryOf({ ...fileAt(1000, 10), path: '/dl/old.mp3' }));

        const result = makeLibrary().recordFile({
            item,
            file: fileAt(2000, 20),
        });

        expect(result).toEqual({ supersededPath: '/dl/old.mp3' });
    });
});

describe('收到「文件已删除」广播', () => {
    const otherKey = JSON.stringify(['demo', 'song-2']);
    const otherItem = { ...item, id: 'song-2' } as MusicItem;
    const otherEntry = (): DownloadedEntry => ({
        item: otherItem,
        mediaKey: otherKey,
        file: { ...fileAt(1000), path: '/dl/other.mp3' },
    });

    it('摘掉指向已删文件的记录', () => {
        shelf.set(KEY, entryOf(fileAt(1000)));

        makeLibrary().onFilesDeleted([PATH]);

        expect(shelf.has(KEY)).toBe(false);
    });

    it('顺手清掉指向该文件的播放锚点', () => {
        // 本地库可能已被清空/移除，那时它反查不到 ref、清不了锚点；
        // 而下载记录里有 ref，锚点又是本模块写下的，收拾自然归本模块
        shelf.set(KEY, entryOf(fileAt(1000)));

        makeLibrary().onFilesDeleted([PATH]);

        expect(mockClearLocalFile).toHaveBeenCalledWith(item, PATH);
    });

    it('清锚点抛错也照样摘记录', () => {
        shelf.set(KEY, entryOf(fileAt(1000)));
        mockClearLocalFile.mockImplementationOnce(() => {
            throw new Error('mmkv boom');
        });

        makeLibrary().onFilesDeleted([PATH]);

        expect(shelf.has(KEY)).toBe(false);
    });

    it('不碰别的记录', () => {
        shelf.set(KEY, entryOf(fileAt(1000)));
        shelf.set(otherKey, otherEntry());

        makeLibrary().onFilesDeleted([PATH]);

        expect(shelf.has(KEY)).toBe(false);
        expect(shelf.has(otherKey)).toBe(true);
    });

    it('一次广播里的多个路径一并摘', () => {
        shelf.set(KEY, entryOf(fileAt(1000)));
        shelf.set(otherKey, otherEntry());

        makeLibrary().onFilesDeleted([PATH, '/dl/other.mp3']);

        expect(shelf.size).toBe(0);
    });

    it('广播里没人认领的路径直接忽略（普通本地音乐就不在下载库里）', () => {
        shelf.set(KEY, entryOf(fileAt(1000)));

        makeLibrary().onFilesDeleted(['/music/unrelated.mp3']);

        expect(shelf.has(KEY)).toBe(true);
    });

    it('镜像还没跟上、记录已指向另一份文件时不摘', () => {
        // 镜像里还是旧路径（发布延迟一个微任务），库里已经是重下后的新路径
        const stale = new Map(shelf);
        stale.set(KEY, entryOf(fileAt(1000)));
        shelf.set(KEY, entryOf({ ...fileAt(2000), path: '/dl/new.mp3' }));
        mockMirror = stale;

        makeLibrary().onFilesDeleted([PATH]);

        expect(shelf.get(KEY)?.file.path).toBe('/dl/new.mp3');
    });

    it('下载记录存 /sdcard 别名而删除广播报 /storage/emulated/0 时同样摘掉（#674）', () => {
        shelf.set(
            KEY,
            entryOf({ ...fileAt(1000), path: '/sdcard/Music/MF/song.mp3' }),
        );

        makeLibrary().onFilesDeleted(['/storage/emulated/0/Music/MF/song.mp3']);

        expect(shelf.has(KEY)).toBe(false);
        expect(mockClearLocalFile).toHaveBeenCalledWith(
            item,
            '/sdcard/Music/MF/song.mp3',
        );
    });
});
