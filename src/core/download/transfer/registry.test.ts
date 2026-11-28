import { DownloadRegistry } from './registry';
import { DOWNLOAD_SCHEMA_VERSION } from './types';

import type { ActiveDownloadRecord } from './types';
import type { MusicItem } from '@/types';

// MMKV 替身：本组只关心归属查询的三态，故用最小内存实现
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

// 截获 registry 交出的快照函数，用来验证它没有提前克隆
const mockSuppliers: (() => ReadonlyMap<string, ActiveDownloadRecord>)[] = [];
jest.mock('./store', () => ({
    publishActiveDownloads: (
        supplier: () => ReadonlyMap<string, ActiveDownloadRecord>,
    ) => {
        mockSuppliers.push(supplier);
    },
}));

const item = {
    platform: 'demo',
    id: 'song-1',
    title: 't',
} as unknown as MusicItem;

const record = {
    item,
    mediaKey: JSON.stringify(['demo', 'song-1']),
    state: 'downloading',
    requestedQuality: 'standard',
    transfer: {
        resolvedQuality: 'high',
        contentKey: 'ck-1',
        stagingKey: 'sk-1',
    },
} as unknown as ActiveDownloadRecord;

describe('快照发布', () => {
    it('交出的是取快照的函数，不提前克隆', () => {
        // 批量入队会连写上千条；每条都克隆一遍 Map 就是 O(N²)。
        // 光看「发布几次」看不出这一点——提前克隆、只发最后一份的实现也只发一次。
        // 故直接拿第一次交出的函数，在第二次落库**之后**调用：
        // 惰性实现能读到最新的两条，提前克隆的只能读到一条
        mockSuppliers.length = 0;
        const registry = new DownloadRegistry();

        registry.put(record);
        const firstSupplier = mockSuppliers.at(-1)!;
        registry.put({
            ...record,
            mediaKey: JSON.stringify(['demo', 'song-2']),
            item: { ...item, id: 'song-2' },
        } as unknown as ActiveDownloadRecord);

        expect(firstSupplier().size).toBe(2);
    });
});

beforeEach(() => {
    mockStore.data.clear();
    mockStore.version = 1;
});

describe('DownloadRegistry.findByContentKey', () => {
    it('按传输身份找到所属歌曲', () => {
        const registry = new DownloadRegistry();
        registry.put(record);

        expect(registry.findByContentKey('ck-1')).toEqual({
            kind: 'found',
            mediaKey: record.mediaKey,
        });
    });

    it('视图完整而确实没有时报 absent', () => {
        const registry = new DownloadRegistry();
        registry.put(record);

        expect(registry.findByContentKey('ck-other')).toEqual({
            kind: 'absent',
        });
    });

    it('尚未开始传输的任务不会被认成所属（它还没有传输身份）', () => {
        const registry = new DownloadRegistry();
        registry.put({
            ...record,
            state: 'pending',
            transfer: undefined,
        } as unknown as ActiveDownloadRecord);

        expect(registry.findByContentKey('ck-1')).toEqual({ kind: 'absent' });
    });

    it('视图不完整（未知 schema）时报 unknown，不当成不存在', () => {
        mockStore.version = 999; // 未来版本 / 降级安装：读不懂，队列视图不可信
        const registry = new DownloadRegistry();

        expect(registry.findByContentKey('ck-1')).toEqual({ kind: 'unknown' });
    });

    it('单条记录损坏时视图也不可信', () => {
        mockStore.data.set('broken-key', JSON.stringify({ junk: true }));
        const registry = new DownloadRegistry();

        expect(registry.findByContentKey('ck-1')).toEqual({ kind: 'unknown' });
    });
});

/**
 * normalize 是显式白名单：新增字段不加进去就会被静默丢弃，
 * 而返回类型允许可选字段缺失，TS 一句话都不会说
 */
describe('失败原因随记录持久化', () => {
    const failed = {
        ...record,
        state: 'failed',
        failure: 'diskFull',
    } as unknown as ActiveDownloadRecord;

    beforeEach(() => {
        mockStore.data.clear();
        mockStore.version = 0;
    });

    it('落库后读得回来', () => {
        const registry = new DownloadRegistry();
        registry.put(failed);

        expect(new DownloadRegistry().get(failed.mediaKey)?.failure).toBe(
            'diskFull',
        );
    });

    it('持久化数据可被篡改：认不出的原因当没有，不把脏值透给界面', () => {
        // 必须直接写磁盘：走 put() 的话脏值在落盘前就被洗掉了，测不到 hydrate 这条路
        mockStore.version = DOWNLOAD_SCHEMA_VERSION; // 版本对不上会整库跳过，那就测不到校验了
        mockStore.data.set(
            failed.mediaKey,
            JSON.stringify({ ...failed, failure: 'somethingBogus' }),
        );

        const record = new DownloadRegistry().get(failed.mediaKey);

        expect(record?.state).toBe('failed'); // 整条仍可用，只是原因不认
        expect(record?.failure).toBeUndefined();
    });
});

describe('落盘目录随传输身份持久化', () => {
    beforeEach(() => {
        mockStore.data.clear();
        mockStore.version = 0;
    });

    const pinned = {
        ...record,
        transfer: { ...record.transfer, destDir: '/storage/emulated/0/Music' },
    } as unknown as ActiveDownloadRecord;

    /**
     * 这条是给「换目录不必清空队列」兜底的：任务的 `.part` 躺在当初那个目录里，
     * 续传必须回到同一个目录。规范化函数同时是**写入路径**的洗值器——漏掉一个字段
     * 就等于它永远存不进去（内存与 MMKV 两份都会被返回值覆盖），而首次发起时用的是
     * 局部对象，症状要到第二次续传才出现
     */
    it('落库后读得回来，内存那份也要有', () => {
        const registry = new DownloadRegistry();
        registry.put(pinned);

        expect(registry.get(pinned.mediaKey)?.transfer?.destDir).toBe(
            '/storage/emulated/0/Music',
        );
        expect(
            new DownloadRegistry().get(pinned.mediaKey)?.transfer?.destDir,
        ).toBe('/storage/emulated/0/Music');
    });

    it('本字段之前的旧记录读出为空（不作废整条）', () => {
        const registry = new DownloadRegistry();
        registry.put(record);

        const read = new DownloadRegistry().get(record.mediaKey);
        expect(read?.transfer?.contentKey).toBe('ck-1');
        expect(read?.transfer?.destDir).toBeUndefined();
    });

    /**
     * 归一化这一层是这三条用例的正题：keep-list 与启动清理的目录集合全靠 `===` 与
     * `resolveDownloadDir` 的输出比，差一个尾斜杠就等于保护失效。若只用本身已归一的
     * 值去测，把 `normalizeAbsoluteDir(...)` 换成裸值照样全绿——注释就成了唯一的守卫
     */
    it('带尾斜杠的值读出来是归一化的（否则永远 !== 当前目录）', () => {
        mockStore.version = DOWNLOAD_SCHEMA_VERSION;
        mockStore.data.set(
            record.mediaKey,
            JSON.stringify({
                ...record,
                transfer: {
                    ...record.transfer,
                    destDir: ' /storage/emulated/0/Music/ ',
                },
            }),
        );

        expect(
            new DownloadRegistry().get(record.mediaKey)?.transfer?.destDir,
        ).toBe('/storage/emulated/0/Music');
    });

    it('非字符串同样算「在而不合法」', () => {
        mockStore.version = DOWNLOAD_SCHEMA_VERSION;
        mockStore.data.set(
            record.mediaKey,
            JSON.stringify({
                ...record,
                transfer: { ...record.transfer, destDir: 123 },
            }),
        );

        expect(new DownloadRegistry().get(record.mediaKey)).toBeUndefined();
    });

    it('在而不合法：整条作废，不拿一个认错的目录去算存活集合', () => {
        mockStore.version = DOWNLOAD_SCHEMA_VERSION;
        mockStore.data.set(
            record.mediaKey,
            JSON.stringify({
                ...record,
                transfer: { ...record.transfer, destDir: 'Music' }, // 相对路径
            }),
        );

        expect(new DownloadRegistry().get(record.mediaKey)).toBeUndefined();
    });
});
