import { MusicCollection } from './musicCollection';
import { PlaylistMusicSortMode } from './types';

import type { PlaylistMusicEntry } from './storage';
import type { MusicItem } from '@/types';

/** 造 MusicItem：platform 默认 'p'，其余字段可覆写 */
function music(id: string, extra: Partial<MusicItem> = {}): MusicItem {
    return {
        platform: 'p',
        id,
        title: '',
        artist: '',
        album: '',
        artwork: '',
        duration: 0,
        ...extra,
    };
}

function entry(
    item: MusicItem,
    addedAt: number,
    batchRank: number,
): PlaylistMusicEntry {
    return { item, addedAt, batchRank };
}

/** 取展示列表的 id 序 */
function ids(collection: MusicCollection): string[] {
    return collection.musicList.map(item => item.id);
}

const {
    Manual,
    AddedAt,
    AddedAtDesc,
    Title,
    TitleDesc,
    Artist,
    ArtistDesc,
    Album,
    AlbumDesc,
} = PlaylistMusicSortMode;

describe('构造与只读视图', () => {
    it('from 保留 entries 的 manual 顺序与排序模式', () => {
        const entries = [entry(music('1'), 100, 0), entry(music('2'), 200, 0)];
        const collection = MusicCollection.from(entries, Manual);
        expect(collection.sortMode).toBe(Manual);
        expect(collection.count).toBe(2);
        expect(ids(collection)).toEqual(['1', '2']);
    });

    it('empty 是空集合', () => {
        const collection = MusicCollection.empty(Manual);
        expect(collection.count).toBe(0);
        expect(collection.musicList).toEqual([]);
        expect(collection.latestArtwork).toBeUndefined();
    });

    it('has 按 platform+id 判定', () => {
        const collection = MusicCollection.from(
            [entry(music('1'), 100, 0)],
            Manual,
        );
        expect(collection.has({ platform: 'p', id: '1' })).toBe(true);
        expect(collection.has({ platform: 'p', id: '2' })).toBe(false);
        expect(collection.has({ platform: 'q', id: '1' })).toBe(false);
    });
});

describe('add', () => {
    it('去重后插入 manual 开头，赋 addedAt 与批内 batchRank', () => {
        const base = MusicCollection.from([entry(music('1'), 100, 0)], Manual);
        const { collection, result } = base.add([music('2'), music('3')], 500);
        expect(result).toEqual({ added: 2, duplicates: 0, invalid: 0 });
        expect(ids(collection)).toEqual(['2', '3', '1']);
        expect(collection.entries[0]).toEqual({
            item: music('2'),
            addedAt: 500,
            batchRank: 0,
        });
        expect(collection.entries[1]!.batchRank).toBe(1);
    });

    it('对已存在项去重、计 duplicates', () => {
        const base = MusicCollection.from([entry(music('1'), 100, 0)], Manual);
        const { collection, result } = base.add([music('1'), music('2')], 500);
        expect(result).toEqual({ added: 1, duplicates: 1, invalid: 0 });
        expect(ids(collection)).toEqual(['2', '1']);
    });

    it('批内重复只保首条', () => {
        const base = MusicCollection.empty(Manual);
        const { collection, result } = base.add(
            [music('1', { title: 'first' }), music('1', { title: 'second' })],
            500,
        );
        expect(result).toEqual({ added: 1, duplicates: 1, invalid: 0 });
        expect(collection.count).toBe(1);
        expect(collection.entries[0]!.item.title).toBe('first');
    });

    it('无 platform+id 的项计 invalid、不加入', () => {
        const base = MusicCollection.empty(Manual);
        const { collection, result } = base.add(
            [music('1'), { id: 'noplat' } as unknown as MusicItem],
            500,
        );
        expect(result).toEqual({ added: 1, duplicates: 0, invalid: 1 });
        expect(ids(collection)).toEqual(['1']);
    });

    it('数字 id 归一为字符串后加入', () => {
        const base = MusicCollection.empty(Manual);
        const { collection } = base.add(
            [{ platform: 'p', id: 5 } as unknown as MusicItem],
            500,
        );
        expect(collection.entries[0]!.item.id).toBe('5');
    });

    it('无新增时返回同一实例', () => {
        const base = MusicCollection.from([entry(music('1'), 100, 0)], Manual);
        const { collection, result } = base.add([music('1')], 500);
        expect(collection).toBe(base);
        expect(result).toEqual({ added: 0, duplicates: 1, invalid: 0 });
    });

    it('不改动原实例', () => {
        const base = MusicCollection.from([entry(music('1'), 100, 0)], Manual);
        base.add([music('2')], 500);
        expect(base.count).toBe(1);
        expect(ids(base)).toEqual(['1']);
    });
});

describe('remove', () => {
    it('按 platform+id 移除、保余下顺序', () => {
        const base = MusicCollection.from(
            [
                entry(music('1'), 100, 0),
                entry(music('2'), 200, 0),
                entry(music('3'), 300, 0),
            ],
            Manual,
        );
        const { collection, result } = base.remove([
            { platform: 'p', id: '2' },
        ]);
        expect(result).toEqual({ removed: 1, missing: 0 });
        expect(ids(collection)).toEqual(['1', '3']);
    });

    it('未命中的 ref 计 missing', () => {
        const base = MusicCollection.from([entry(music('1'), 100, 0)], Manual);
        const { collection, result } = base.remove([
            { platform: 'p', id: '1' },
            { platform: 'p', id: '9' },
        ]);
        expect(result).toEqual({ removed: 1, missing: 1 });
        expect(collection.count).toBe(0);
    });

    it('全部未命中时返回同一实例', () => {
        const base = MusicCollection.from([entry(music('1'), 100, 0)], Manual);
        const { collection, result } = base.remove([
            { platform: 'p', id: '9' },
        ]);
        expect(collection).toBe(base);
        expect(result).toEqual({ removed: 0, missing: 1 });
    });
});

describe('clear', () => {
    it('清空非空集合并返回删除条数', () => {
        const base = MusicCollection.from(
            [entry(music('1'), 100, 0), entry(music('2'), 200, 0)],
            Manual,
        );
        const { collection, removed } = base.clear();
        expect(removed).toBe(2);
        expect(collection.count).toBe(0);
    });

    it('空集合返回同一实例', () => {
        const base = MusicCollection.empty(Manual);
        const { collection, removed } = base.clear();
        expect(collection).toBe(base);
        expect(removed).toBe(0);
    });
});

describe('reorder', () => {
    const base = MusicCollection.from(
        [
            entry(music('1'), 100, 0),
            entry(music('2'), 200, 0),
            entry(music('3'), 300, 0),
        ],
        AddedAtDesc,
    );

    it('精确排列时按新序切 Manual、保留 addedAt/batchRank', () => {
        const result = base.reorder([
            { platform: 'p', id: '3' },
            { platform: 'p', id: '1' },
            { platform: 'p', id: '2' },
        ]);
        expect(result).not.toBeNull();
        expect(result!.sortMode).toBe(Manual);
        expect(result!.entries.map(e => e.item.id)).toEqual(['3', '1', '2']);
        expect(result!.entries[0]!.addedAt).toBe(300);
    });

    it('长度不符返回 null', () => {
        expect(base.reorder([{ platform: 'p', id: '1' }])).toBeNull();
    });

    it('含重复 ref 返回 null', () => {
        expect(
            base.reorder([
                { platform: 'p', id: '1' },
                { platform: 'p', id: '1' },
                { platform: 'p', id: '2' },
            ]),
        ).toBeNull();
    });

    it('含未知 ref 返回 null', () => {
        expect(
            base.reorder([
                { platform: 'p', id: '1' },
                { platform: 'p', id: '2' },
                { platform: 'p', id: '9' },
            ]),
        ).toBeNull();
    });
});

describe('排序模式', () => {
    // manual 序 [1,2,3]；加入序 1(100,0) < 2(200,0) < 3(200,1)
    // artist 刻意取 y/x/z：升降序均不等于 manual 序及其反转，避免「直接返回原序」也能蒙混过关
    const i1 = music('1', {
        title: 'charlie',
        artist: 'y',
        album: 'm',
        artwork: 'a1',
    });
    const i2 = music('2', {
        title: 'alpha',
        artist: 'x',
        album: 'n',
        artwork: 'a2',
    });
    const i3 = music('3', {
        title: 'bravo',
        artist: 'z',
        album: 'm',
        artwork: 'a3',
    });
    const entries = [entry(i1, 100, 0), entry(i2, 200, 0), entry(i3, 200, 1)];
    const build = (mode: PlaylistMusicSortMode) =>
        MusicCollection.from(entries, mode);

    it('Manual 用数组序', () => {
        expect(ids(build(Manual))).toEqual(['1', '2', '3']);
    });

    it('AddedAt 按 addedAt→batchRank 升序', () => {
        expect(ids(build(AddedAt))).toEqual(['1', '2', '3']);
    });

    it('AddedAtDesc 是 AddedAt 的完全反转', () => {
        expect(ids(build(AddedAtDesc))).toEqual(['3', '2', '1']);
    });

    it('Title 按标题升序', () => {
        expect(ids(build(Title))).toEqual(['2', '3', '1']);
    });

    it('TitleDesc 按标题降序', () => {
        expect(ids(build(TitleDesc))).toEqual(['1', '3', '2']);
    });

    it('Artist 按歌手升序', () => {
        expect(ids(build(Artist))).toEqual(['2', '1', '3']);
    });

    it('ArtistDesc 按歌手降序', () => {
        expect(ids(build(ArtistDesc))).toEqual(['3', '1', '2']);
    });

    it('Album 升序、等键落回 manual 序', () => {
        // album：1='m'、3='m'、2='n' → m 组按 manual 序 [1,3]，再 2
        expect(ids(build(Album))).toEqual(['1', '3', '2']);
    });

    it('AlbumDesc 降序、等键仍落回 manual 序（不随字段一并反转）', () => {
        // album 降序：'n' 组 [2]，再 'm' 组仍按 manual 序 [1,3]
        expect(ids(build(AlbumDesc))).toEqual(['2', '1', '3']);
    });

    it('AddedAt 全等键（addedAt+batchRank 相同）落回 mediaKey 序（与数组位置无关）', () => {
        const same = [entry(music('b'), 200, 0), entry(music('a'), 200, 0)];
        expect(ids(MusicCollection.from(same, AddedAt))).toEqual(['a', 'b']);
    });
});

describe('latestArtwork', () => {
    const i1 = music('1', { title: 'charlie', artwork: 'a1' });
    const i2 = music('2', { title: 'alpha', artwork: 'a2' });
    const entries = [entry(i1, 100, 0), entry(i2, 200, 0)];

    it('恒取最近加入那首（addedAt 最大），与排序模式无关', () => {
        expect(MusicCollection.from(entries, Manual).latestArtwork).toBe('a2');
        expect(MusicCollection.from(entries, Title).latestArtwork).toBe('a2');
        expect(MusicCollection.from(entries, AddedAtDesc).latestArtwork).toBe(
            'a2',
        );
        expect(MusicCollection.from(entries, AddedAt).latestArtwork).toBe('a2');
    });

    it('同 addedAt 取 batchRank 最大（最后加入那首）', () => {
        const batch = [
            entry(music('1', { artwork: 'a1' }), 200, 0),
            entry(music('2', { artwork: 'a2' }), 200, 1),
        ];
        expect(MusicCollection.from(batch, Manual).latestArtwork).toBe('a2');
    });

    it('全等键（addedAt+batchRank 相同）取 mediaKey 最大、与数组位置无关', () => {
        const a = entry(music('a', { artwork: 'aa' }), 200, 0);
        const b = entry(music('b', { artwork: 'bb' }), 200, 0);
        expect(MusicCollection.from([a, b], Manual).latestArtwork).toBe('bb');
        expect(MusicCollection.from([b, a], Manual).latestArtwork).toBe('bb');
    });

    it('最近加入那首无封面时往后取最近的有封面者', () => {
        const list = [
            entry(music('1', { artwork: 'a1' }), 100, 0),
            entry(music('2', { artwork: '' }), 200, 0),
        ];
        expect(MusicCollection.from(list, Manual).latestArtwork).toBe('a1');
    });

    it('所有歌都无封面时 undefined', () => {
        const list = [
            entry(music('1', { artwork: '' }), 100, 0),
            entry(music('2'), 200, 0),
        ];
        expect(
            MusicCollection.from(list, Manual).latestArtwork,
        ).toBeUndefined();
    });

    it('较新歌曲封面为纯空白时跳过、取较早的有效封面', () => {
        const list = [
            entry(music('1', { artwork: 'a1' }), 100, 0),
            entry(music('2', { artwork: '   ' }), 200, 0),
        ];
        expect(MusicCollection.from(list, Manual).latestArtwork).toBe('a1');
    });

    it.each([
        { artwork: undefined },
        { artwork: null },
        { artwork: 0 },
        { artwork: 42 },
        { artwork: false },
        { artwork: { uri: 'cover.jpg' } },
        { artwork: ['cover.jpg'] },
    ])('非字符串封面 $artwork 不影响集合，也不改写歌曲', ({ artwork }) => {
        const item = { ...music('2'), artwork } as unknown as MusicItem;
        const badEntry = entry(item, 200, 0);
        const collection = MusicCollection.from(
            [entry(music('1', { artwork: 'a1' }), 100, 0), badEntry],
            Manual,
        );

        expect(collection.latestArtwork).toBe('a1');
        expect(collection.count).toBe(2);
        expect(collection.musicList[1]).toBe(item);
        expect(item.artwork).toBe(artwork);
        expect(
            MusicCollection.from([badEntry], Manual).latestArtwork,
        ).toBeUndefined();
    });
});

describe('withSortMode', () => {
    const base = MusicCollection.from(
        [entry(music('1'), 100, 0), entry(music('2'), 200, 0)],
        Manual,
    );

    it('切换模式返回新实例、entries 不变、展示序更新', () => {
        const next = base.withSortMode(AddedAtDesc);
        expect(next).not.toBe(base);
        expect(next.entries).toBe(base.entries);
        expect(ids(next)).toEqual(['2', '1']);
    });

    it('同模式返回同一实例', () => {
        expect(base.withSortMode(Manual)).toBe(base);
    });
});

describe('唯一性不变量与不可变性', () => {
    it('from 对重复 platform+id 去重保首条', () => {
        const dup = [
            entry(music('1', { title: 'first' }), 100, 0),
            entry(music('1', { title: 'second' }), 200, 0),
            entry(music('2'), 300, 0),
        ];
        const collection = MusicCollection.from(dup, Manual);
        expect(collection.count).toBe(2);
        expect(collection.entries[0]!.item.title).toBe('first');
        expect(ids(collection)).toEqual(['1', '2']);
    });

    it('from 去重后 remove 命中重复键的 missing 计数正确', () => {
        const dup = [entry(music('1'), 100, 0), entry(music('1'), 200, 0)];
        const collection = MusicCollection.from(dup, Manual);
        const { result } = collection.remove([{ platform: 'p', id: '1' }]);
        expect(result).toEqual({ removed: 1, missing: 0 });
    });

    it('构造后修改源数组，集合保持不变', () => {
        const source = [entry(music('1'), 100, 0)];
        const collection = MusicCollection.from(source, Manual);
        source.push(entry(music('2'), 200, 0));
        expect(collection.count).toBe(1);
        expect(ids(collection)).toEqual(['1']);
    });
});

describe('补充边界', () => {
    it('remove 对重复 ref 去重后计 missing', () => {
        const base = MusicCollection.from([entry(music('1'), 100, 0)], Manual);
        const { result } = base.remove([
            { platform: 'p', id: '1' },
            { platform: 'p', id: '1' },
            { platform: 'p', id: '9' },
            { platform: 'p', id: '9' },
        ]);
        expect(result).toEqual({ removed: 1, missing: 1 });
    });

    it('同批混合 existing/batch 重复、invalid、数字 id：计数互不串、batchRank 连续', () => {
        const base = MusicCollection.from([entry(music('1'), 100, 0)], Manual);
        const { collection, result } = base.add(
            [
                music('1'), // 已存在
                music('2'), // 新增
                music('2'), // 批内重复
                { id: 'x' } as unknown as MusicItem, // 无 platform
                { platform: 'p', id: 3 } as unknown as MusicItem, // 数字 id
            ],
            500,
        );
        expect(result).toEqual({ added: 2, duplicates: 2, invalid: 1 });
        expect(ids(collection)).toEqual(['2', '3', '1']);
        expect(collection.entries[0]!.batchRank).toBe(0);
        expect(collection.entries[1]!.batchRank).toBe(1);
    });

    it('排序字段非字符串时回落空串', () => {
        const weird = { ...music('1'), title: undefined as unknown as string };
        const entries = [
            entry(music('2', { title: 'b' }), 100, 0),
            entry(weird, 200, 0),
        ];
        // title：'' (id 1) < 'b' (id 2)
        expect(ids(MusicCollection.from(entries, Title))).toEqual(['1', '2']);
    });

    it('AddedAtDesc 全等键（addedAt+batchRank 相同）按 mediaKey 反转（与数组位置无关）', () => {
        const same = [entry(music('b'), 200, 0), entry(music('a'), 200, 0)];
        expect(ids(MusicCollection.from(same, AddedAtDesc))).toEqual([
            'b',
            'a',
        ]);
    });
});

describe('成员键集复用与 keys 视图', () => {
    const base = MusicCollection.from(
        [entry(music('1'), 100, 0), entry(music('2'), 200, 0)],
        Manual,
    );

    it('keys 反映 platform+id 成员集、与 has 一致', () => {
        expect(base.keys.size).toBe(2);
        expect(base.has({ platform: 'p', id: '1' })).toBe(true);
        expect(base.has({ platform: 'p', id: '9' })).toBe(false);
    });

    it('reorder 成员不变时复用同一键集引用、判定不变', () => {
        const next = base.reorder([
            { platform: 'p', id: '2' },
            { platform: 'p', id: '1' },
        ])!;
        expect(next.keys).toBe(base.keys);
        expect(next.has({ platform: 'p', id: '1' })).toBe(true);
        expect(next.has({ platform: 'p', id: '2' })).toBe(true);
    });

    it('withSortMode 成员不变时复用同一键集引用', () => {
        const next = base.withSortMode(AddedAtDesc);
        expect(next.keys).toBe(base.keys);
        expect(next.keys.size).toBe(2);
    });

    it('add 产出含新键的新键集、不改父集', () => {
        const { collection } = base.add([music('3')], 500);
        expect(collection.keys.size).toBe(3);
        expect(collection.has({ platform: 'p', id: '3' })).toBe(true);
        expect(base.keys.size).toBe(2);
        expect(base.has({ platform: 'p', id: '3' })).toBe(false);
    });

    it('remove 产出去掉命中键的新键集、不改父集', () => {
        const { collection } = base.remove([{ platform: 'p', id: '1' }]);
        expect(collection.keys.size).toBe(1);
        expect(collection.has({ platform: 'p', id: '1' })).toBe(false);
        expect(collection.has({ platform: 'p', id: '2' })).toBe(true);
        expect(base.keys.size).toBe(2);
    });
});

describe('musicList 惰性计算与记忆化', () => {
    it('from 时不排序、首次读 musicList 才排序、再读复用缓存', () => {
        let titleReads = 0;
        const spied = { ...music('1') } as MusicItem;
        Object.defineProperty(spied, 'title', {
            get() {
                titleReads += 1;
                return 'z';
            },
            enumerable: true,
            configurable: true,
        });
        const collection = MusicCollection.from(
            [entry(spied, 100, 0), entry(music('2', { title: 'a' }), 200, 0)],
            Title,
        );
        // 构造/去重只读 platform+id，未触发按 title 排序
        expect(titleReads).toBe(0);
        const first = collection.musicList;
        const afterFirst = titleReads;
        expect(afterFirst).toBeGreaterThan(0);
        expect(first.map(m => m.id)).toEqual(['2', '1']);
        // 再读复用缓存：同一引用、不再排序
        const second = collection.musicList;
        expect(second).toBe(first);
        expect(titleReads).toBe(afterFirst);
    });
});
