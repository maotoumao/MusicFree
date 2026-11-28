import { MediaMeta } from '.';

import type { MusicItem } from '@/types';

interface FakeStore {
    getString(key: string): string | undefined;
    getNumber(key: string): number | undefined;
    set(key: string, value: string | number): void;
    remove(key: string): void;
    getAllKeys(): string[];
    clearAll(): void;
}

interface LocalFilesCase {
    name: string;
    stored: object;
    expected: ReturnType<MediaMeta['getLocalFiles']>;
}

// —— 依赖 mock：只需绕开原生 MMKV（mediaMeta 仅依赖 @/infra/storage）——

jest.mock('@/infra/storage', () => {
    const stores = new Map<string, FakeStore>();
    const create = (): FakeStore => {
        const strings = new Map<string, string>();
        const numbers = new Map<string, number>();
        return {
            getString: key => strings.get(key),
            getNumber: key => numbers.get(key),
            set: (key, value) => {
                if (typeof value === 'number') {
                    numbers.set(key, value);
                } else {
                    strings.set(key, value);
                }
            },
            remove: key => {
                strings.delete(key);
                numbers.delete(key);
            },
            getAllKeys: () => [...strings.keys(), ...numbers.keys()],
            clearAll: () => {
                strings.clear();
                numbers.clear();
            },
        };
    };
    return {
        __stores: stores,
        listMMKVIds: jest.fn(async () => [...stores.keys()]),
        getOrCreateMMKV: (id: string) => {
            let store = stores.get(id);
            if (!store) {
                store = create();
                stores.set(id, store);
            }
            return store;
        },
        getObject: (store: FakeStore, key: string) => {
            const raw = store.getString(key);
            if (raw === undefined) {
                return undefined;
            }
            try {
                return JSON.parse(raw);
            } catch {
                return undefined;
            }
        },
        setObject: (store: FakeStore, key: string, value: unknown) => {
            if (value === undefined) {
                store.remove(key);
                return true;
            }
            let text: string;
            try {
                // 只序列化失败（循环引用等）返 false；store.set 不兜（同生产 safeStringify 语义）
                text = JSON.stringify(value);
            } catch {
                return false;
            }
            store.set(key, text);
            return true;
        },
    };
});

const storage = jest.requireMock('@/infra/storage') as {
    __stores: Map<string, FakeStore>;
    getOrCreateMMKV: (id: string) => FakeStore;
    listMMKVIds: jest.Mock<Promise<string[]>, []>;
};

/** 最小 MusicItem 假体：传输只做透传，形状不校验 */
function fakeMusicItem(over: Partial<MusicItem> = {}): MusicItem {
    return {
        platform: 'src',
        id: 'assoc-song',
        title: 't',
        ...over,
    } as unknown as MusicItem;
}

/** 直接把一条原始记录灌进 MediaExtra.<platform> store */
function seedStored(platform: string, id: string, value: object): void {
    storage
        .getOrCreateMMKV(`MediaExtra.${platform}`)
        .set(id, JSON.stringify(value));
}

/** 读回某条原始记录（未设置返 undefined） */
function readStored(
    platform: string,
    id: string,
): Record<string, unknown> | undefined {
    const raw = storage.getOrCreateMMKV(`MediaExtra.${platform}`).getString(id);
    return raw === undefined ? undefined : JSON.parse(raw);
}

let meta: MediaMeta;

beforeEach(() => {
    // mediaMeta 不在模块加载期捕获 store，可直接清空注册表（下次 getOrCreateMMKV 重建）
    storage.__stores.clear();
    storage.listMMKVIds
        .mockReset()
        .mockImplementation(async () => [...storage.__stores.keys()]);
    meta = new MediaMeta();
});

describe('getLocalFiles', () => {
    const ref = { platform: 'demo', id: 'song' };

    it('没有记录或身份无效时返回空数组', () => {
        expect(meta.getLocalFiles({ platform: '', id: 'song' })).toEqual([]);
        expect(meta.getLocalFiles({ platform: 'demo', id: '' })).toEqual([]);
        expect(storage.__stores.size).toBe(0);
        expect(meta.getLocalFiles(ref)).toEqual([]);
    });

    it.each<LocalFilesCase>([
        { name: '没有文件字段', stored: {}, expected: [] },
        {
            name: '只有下载路径',
            stored: {
                downloadData: { path: '/download/a.mp3', quality: 'low' },
            },
            expected: [{ path: '/download/a.mp3', quality: 'low' }],
        },
        {
            name: '只有扫描路径',
            stored: { localPath: '/music/b.flac' },
            expected: [{ path: '/music/b.flac' }],
        },
        {
            name: '下载与扫描按原优先级列出',
            stored: {
                downloadData: { path: '/download/a.mp3', quality: 'high' },
                localPath: '/music/b.flac',
            },
            expected: [
                { path: '/download/a.mp3', quality: 'high' },
                { path: '/music/b.flac' },
            ],
        },
        {
            name: '相同路径去重且保留下载音质',
            stored: {
                downloadData: { path: '/music/a.mp3', quality: 'low' },
                localPath: '/music/a.mp3',
            },
            expected: [{ path: '/music/a.mp3', quality: 'low' }],
        },
        {
            name: '非法音质不丢弃路径',
            stored: {
                downloadData: { path: '/download/a.mp3', quality: 'invalid' },
                localPath: '/music/b.flac',
            },
            expected: [{ path: '/download/a.mp3' }, { path: '/music/b.flac' }],
        },
        {
            name: '非法下载路径不遮蔽扫描路径',
            stored: { downloadData: { path: 123 }, localPath: '/music/b.flac' },
            expected: [{ path: '/music/b.flac' }],
        },
        {
            name: '空路径和非法扫描路径不产生候选',
            stored: { downloadData: { path: '' }, localPath: false },
            expected: [],
        },
        {
            name: '保留原始路径而不做别名归一',
            stored: {
                downloadData: { path: '/sdcard/Music/中文 #100%.mp3' },
                localPath: '/storage/emulated/0/Music/中文 #100%.mp3',
            },
            expected: [
                { path: '/sdcard/Music/中文 #100%.mp3' },
                { path: '/storage/emulated/0/Music/中文 #100%.mp3' },
            ],
        },
    ])('$name', ({ stored, expected }) => {
        seedStored(ref.platform, ref.id, stored);
        expect(meta.getLocalFiles(ref)).toEqual(expected);
    });

    it('返回新快照，只读一次记录且不写存储', () => {
        const stored = {
            downloadData: { path: '/download/old.mp3', quality: 'low' },
            localPath: '/music/moved.mp3',
            lyricOffset: 1,
        };
        seedStored(ref.platform, ref.id, stored);
        const store = storage.getOrCreateMMKV('MediaExtra.demo');
        const read = jest.spyOn(store, 'getString');
        const write = jest.spyOn(store, 'set');
        const remove = jest.spyOn(store, 'remove');

        const files = meta.getLocalFiles(ref);

        expect(read).toHaveBeenCalledTimes(1);
        expect(write).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
        expect(files[0]).toEqual({
            path: '/download/old.mp3',
            quality: 'low',
        });
        const first = files[0];
        if (!first) {
            throw new Error('missing download candidate');
        }
        first.path = '/changed-by-caller.mp3';
        expect(meta.getLocalFiles(ref)[0]?.path).toBe('/download/old.mp3');
        expect(readStored(ref.platform, ref.id)).toEqual(stored);
    });

    it('相同 id 的其他平台与同平台的其他 id 不共享候选', () => {
        meta.setLocalPath(ref, '/music/a.mp3');
        meta.setLocalPath({ platform: 'other', id: ref.id }, '/music/b.mp3');
        meta.setLocalPath(
            { platform: ref.platform, id: 'other' },
            '/music/c.mp3',
        );

        expect(meta.getLocalFiles(ref)).toEqual([{ path: '/music/a.mp3' }]);
        expect(meta.getLocalFiles({ platform: 'other', id: ref.id })).toEqual([
            { path: '/music/b.mp3' },
        ]);
        expect(
            meta.getLocalFiles({ platform: ref.platform, id: 'other' }),
        ).toEqual([{ path: '/music/c.mp3' }]);
    });

    it('损坏记录保持原有读侧容错且不覆写', () => {
        const store = storage.getOrCreateMMKV('MediaExtra.demo');
        store.set(ref.id, '{broken');

        expect(meta.getLocalFiles(ref)).toEqual([]);
        expect(store.getString(ref.id)).toBe('{broken');
    });
});

describe('listPlatforms', () => {
    it('恢复无插件平台后由持久化目录发现，包含特殊字符平台', async () => {
        meta.restoreMediaMeta([
            { platform: 'demo/archived', id: 'song', lyricOffset: 2.5 },
        ]);
        storage.listMMKVIds.mockResolvedValue([]);
        const restarted = new MediaMeta();
        const platforms = await restarted.listPlatforms(['本地']);
        expect(platforms).toEqual(['demo/archived', '本地']);
        expect(restarted.snapshotMediaMeta(platforms)).toEqual([
            { platform: 'demo/archived', id: 'song', lyricOffset: 2.5 },
        ]);
    });

    it('无索引的旧明文 store 可以补入平台目录，且同平台去重', async () => {
        seedStored('removed', 'song', { lyricOffset: 1 });
        expect(await meta.listPlatforms(['removed', '本地'])).toEqual([
            'removed',
            '本地',
        ]);
        expect(
            JSON.parse(
                storage
                    .getOrCreateMMKV('music.MediaMeta')
                    .getString('platforms')!,
            ),
        ).toEqual(['removed', '本地']);
    });

    it('目录损坏时拒绝导出，不覆盖为新目录', async () => {
        const directory = storage.getOrCreateMMKV('music.MediaMeta');
        directory.set('platforms', '{broken');
        await expect(meta.listPlatforms(['demo'])).rejects.toThrow(
            'Invalid media platform directory',
        );
        expect(directory.getString('platforms')).toBe('{broken');
    });

    it('扫描失败不伪装为空平台列表', async () => {
        storage.listMMKVIds.mockRejectedValue(
            new Error('storage inaccessible'),
        );
        await expect(meta.listPlatforms([])).rejects.toThrow(
            'storage inaccessible',
        );
    });

    it('扫描过程中新增平台不会被覆盖', async () => {
        storage.listMMKVIds.mockImplementation(async () => {
            meta.setLyricOffset({ platform: 'new-during-scan', id: 'song' }, 1);
            return ['MediaExtra.old'];
        });
        expect(await meta.listPlatforms([])).toEqual([
            'new-during-scan',
            'old',
        ]);
    });
});

describe('snapshotMediaMeta', () => {
    it('只输出含纳入字段的记录，剥掉 downloadData/localPath', () => {
        const musicItem = fakeMusicItem();
        seedStored('a', 's1', {
            lyricOffset: -0.5,
            downloadData: { path: 'x' },
            localPath: 'y',
        });
        seedStored('a', 's2', {
            lyricOverride: { kind: 'associated', musicItem },
        });
        seedStored('a', 's3', { downloadData: { path: 'z' } }); // 无纳入字段 → 排除

        const snap = meta.snapshotMediaMeta(['a']);

        expect(snap).toEqual([
            { platform: 'a', id: 's1', lyricOffset: -0.5 },
            { platform: 'a', id: 's2', associatedLyric: { musicItem } },
        ]);
    });

    it('手工编辑的歌词不进备份（lyricOverride=custom 无 wire 表示）', () => {
        seedStored('a', 's1', { lyricOverride: { kind: 'custom' } });
        seedStored('a', 's2', {
            lyricOffset: 1,
            lyricOverride: { kind: 'custom' },
        });

        const snap = meta.snapshotMediaMeta(['a']);

        // s1 无其它纳入字段 → 整条排除；s2 只留 lyricOffset
        expect(snap).toEqual([{ platform: 'a', id: 's2', lyricOffset: 1 }]);
    });

    it('多平台扫描，lyricOffset 为 0 也保留（≠ 缺省）', () => {
        seedStored('a', 's1', { lyricOffset: 0 });
        seedStored('b', 's2', { lyricOffset: 1.2 });

        const snap = meta.snapshotMediaMeta(['a', 'b']);

        expect(snap).toEqual([
            { platform: 'a', id: 's1', lyricOffset: 0 },
            { platform: 'b', id: 's2', lyricOffset: 1.2 },
        ]);
    });

    it('跳过 $version 等保留键', () => {
        seedStored('a', 's1', { lyricOffset: 1 });
        storage.getOrCreateMMKV('MediaExtra.a').set('$version', 3); // number 保留键

        const snap = meta.snapshotMediaMeta(['a']);

        expect(snap).toEqual([{ platform: 'a', id: 's1', lyricOffset: 1 }]);
    });

    it('空平台列表 → 空数组', () => {
        expect(meta.snapshotMediaMeta([])).toEqual([]);
    });

    it('单平台读失败不阻断其余平台（best-effort）', () => {
        seedStored('good', 's1', { lyricOffset: 1 });
        const badStore = storage.getOrCreateMMKV('MediaExtra.bad');
        badStore.getAllKeys = () => {
            throw new Error('boom');
        };

        const snap = meta.snapshotMediaMeta(['bad', 'good']);

        expect(snap).toEqual([{ platform: 'good', id: 's1', lyricOffset: 1 }]);
    });
});

describe('restoreMediaMeta', () => {
    it('字段并集 upsert：覆盖出现字段、保留目标端 downloadData/localPath', () => {
        seedStored('a', 's1', {
            downloadData: { path: 'd' },
            localPath: 'l',
            lyricOffset: -1,
        });

        const result = meta.restoreMediaMeta([
            { platform: 'a', id: 's1', lyricOffset: 2 },
        ]);

        expect(result).toEqual({ upserted: 1, skipped: 0 });
        expect(readStored('a', 's1')).toEqual({
            downloadData: { path: 'd' },
            localPath: 'l',
            lyricOffset: 2,
        });
    });

    it('写入 associatedLyric（仅 musicItem），保留其它字段', () => {
        const musicItem = fakeMusicItem();
        seedStored('a', 's1', { downloadData: { path: 'd' } });

        meta.restoreMediaMeta([
            { platform: 'a', id: 's1', associatedLyric: { musicItem } },
        ]);

        expect(readStored('a', 's1')).toEqual({
            downloadData: { path: 'd' },
            lyricOverride: { kind: 'associated', musicItem },
        });
    });

    it('新建记录（目标端原本无该条）', () => {
        const musicItem = fakeMusicItem();

        const result = meta.restoreMediaMeta([
            {
                platform: 'a',
                id: 'new',
                lyricOffset: 1.5,
                associatedLyric: { musicItem },
            },
        ]);

        expect(result).toEqual({ upserted: 1, skipped: 0 });
        expect(readStored('a', 'new')).toEqual({
            lyricOffset: 1.5,
            lyricOverride: { kind: 'associated', musicItem },
        });
    });

    it('跳过无纳入字段 / ref 非法的条目、不写盘', () => {
        const result = meta.restoreMediaMeta([
            { platform: 'a', id: 's1' }, // 无纳入字段
            { platform: '', id: 'x', lyricOffset: 1 }, // 非法 platform
        ]);

        expect(result).toEqual({ upserted: 0, skipped: 2 });
        expect(readStored('a', 's1')).toBeUndefined();
    });

    it('序列化失败 → 计 skipped、不阻断其余', () => {
        const circular = {} as Record<string, unknown>;
        circular.self = circular;
        const musicItem = fakeMusicItem();

        const result = meta.restoreMediaMeta([
            {
                platform: 'a',
                id: 'bad',
                associatedLyric: {
                    musicItem: circular as unknown as MusicItem,
                },
            },
            { platform: 'a', id: 'good', associatedLyric: { musicItem } },
        ]);

        expect(result).toEqual({ upserted: 1, skipped: 1 });
        expect(readStored('a', 'bad')).toBeUndefined();
        expect(readStored('a', 'good')).toEqual({
            lyricOverride: { kind: 'associated', musicItem },
        });
    });

    it('恢复 lyricOffset=0（有效值，非跳过）', () => {
        seedStored('a', 's1', { lyricOffset: 2 });

        const result = meta.restoreMediaMeta([
            { platform: 'a', id: 's1', lyricOffset: 0 },
        ]);

        expect(result).toEqual({ upserted: 1, skipped: 0 });
        expect(readStored('a', 's1')).toEqual({ lyricOffset: 0 });
    });

    it('只恢复一个纳入字段时，保留目标端已有的另一个纳入字段', () => {
        const musicItem = fakeMusicItem();
        seedStored('a', 's1', {
            lyricOffset: -1,
            lyricOverride: { kind: 'associated', musicItem },
        });

        meta.restoreMediaMeta([{ platform: 'a', id: 's1', lyricOffset: 3 }]);

        expect(readStored('a', 's1')).toEqual({
            lyricOffset: 3,
            lyricOverride: { kind: 'associated', musicItem }, // 未被 item 触及 → 保留
        });
    });

    it('跳过 id 撞 $ 保留键，不污染 $version', () => {
        const store = storage.getOrCreateMMKV('MediaExtra.a');
        store.set('$version', 5); // 原生 number 版本键

        const result = meta.restoreMediaMeta([
            { platform: 'a', id: '$version', lyricOffset: 1 },
        ]);

        expect(result).toEqual({ upserted: 0, skipped: 1 });
        expect(store.getNumber('$version')).toBe(5); // number 未被覆盖
        expect(store.getString('$version')).toBeUndefined(); // 未写入 string
    });
});

describe('clearLocalFile (#674)', () => {
    const ref = { platform: 'demo', id: 'song-1' };

    it('按 /sdcard 与 /storage/emulated/0 或 file:// 等价路径一并清掉双槽', () => {
        seedStored(ref.platform, ref.id, {
            downloadData: {
                path: '/sdcard/Music/晴天 #100%.mp3',
                quality: 'high',
            },
            localPath: '/storage/emulated/0/Music/晴天 #100%.mp3',
            lyricOffset: 1.5,
        });

        meta.clearLocalFile(ref, '/storage/emulated/0/Music/晴天 #100%.mp3');

        expect(meta.hasLocalFile(ref)).toBe(false);
        expect(readStored(ref.platform, ref.id)).toEqual({ lyricOffset: 1.5 });
    });

    it('兼容清理旧版 v0.6.x 遗留的 file:// 形式 localPath', () => {
        seedStored(ref.platform, ref.id, {
            localPath: 'file:///storage/emulated/0/Music/100%.mp3',
        });

        meta.clearLocalFile(ref, '/storage/emulated/0/Music/100%.mp3');

        expect(meta.hasLocalFile(ref)).toBe(false);
    });
});
