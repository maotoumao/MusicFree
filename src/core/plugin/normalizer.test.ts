import { methodNormalizers, normalizeMediaItem } from './normalizer';

import type { RecommendPlaylistTagsResult } from '@/types';

const spec = methodNormalizers.getRecommendPlaylistTags;

/** 直接驱动 getRecommendPlaylistTags 的入站归一化器（platform 于标签归一无关，传占位值） */
function normalize(raw: unknown): RecommendPlaylistTagsResult {
    return spec.normalizeResult!(raw, 'p') as RecommendPlaylistTagsResult;
}

describe('getRecommendPlaylistTags 归一化', () => {
    it('非数组 pinned / data、undefined、空对象 → 空数组', () => {
        expect(normalize(undefined)).toEqual({ pinned: [], data: [] });
        expect(normalize({})).toEqual({ pinned: [], data: [] });
        expect(normalize({ pinned: 'x', data: 42 })).toEqual({
            pinned: [],
            data: [],
        });
    });

    it('剔除无效 tag（非对象 / 缺 id / 空串 id / 非有限数字 id）', () => {
        const result = normalize({
            pinned: [
                { id: 'a', title: 'A' },
                { id: '' },
                { id: Number.NaN },
                { id: Number.POSITIVE_INFINITY },
                { title: '无 id' },
                null,
                'str',
                42,
            ],
        });
        expect(result.pinned).toEqual([{ id: 'a', title: 'A' }]);
    });

    it('有限数字 id 转字符串、保留扩展字段、不改入站对象', () => {
        const input = { id: 123, title: 'T', extra: 'keep' };
        const result = normalize({ pinned: [input] });
        expect(result.pinned).toEqual([
            { id: '123', title: 'T', extra: 'keep' },
        ]);
        // 入站对象不被 mutate
        expect(input.id).toBe(123);
    });

    it('字符串 id 的 tag 原样保留扩展字段', () => {
        const result = normalize({
            pinned: [{ id: 'x', title: 'X', foo: 1 }],
        });
        expect(result.pinned).toEqual([{ id: 'x', title: 'X', foo: 1 }]);
    });

    it('分组：null / primitive group 不抛错、title 仅取字符串、data 递归归一、剔无效 id', () => {
        const result = normalize({
            data: [
                null,
                'str',
                { title: 123, data: [{ id: 'x' }] },
                { title: '语种', data: [{ id: 'zh' }, { id: '' }] },
                { data: 'not-array' },
            ],
        });
        expect(result.data).toEqual([
            { title: undefined, data: [] },
            { title: undefined, data: [] },
            { title: undefined, data: [{ id: 'x' }] },
            { title: '语种', data: [{ id: 'zh' }] },
            { title: undefined, data: [] },
        ]);
    });
});

describe('normalizeMediaItem 归一化', () => {
    it('旧拼写 createAt → 补 canonical createdAt，且保留旧键', () => {
        const result = normalizeMediaItem({ id: 'a', createAt: 111 }, 'p');

        expect(result).toEqual({
            id: 'a',
            platform: 'p',
            createdAt: 111,
            createAt: 111,
        });
    });

    it('已有合法 createdAt → 不被 createAt 覆盖', () => {
        const result = normalizeMediaItem(
            { id: 'a', createdAt: 222, createAt: 111 },
            'p',
        );

        expect(result.createdAt).toBe(222);
    });

    it('createdAt 非有限数 → 用 createAt 补齐', () => {
        const result = normalizeMediaItem(
            { id: 'a', createdAt: 'nope', createAt: 111 },
            'p',
        );

        expect(result.createdAt).toBe(111);
    });

    it('createAt 非有限数 → 不补 createdAt', () => {
        expect(
            normalizeMediaItem({ id: 'a', createAt: Number.NaN }, 'p'),
        ).not.toHaveProperty('createdAt');
        expect(
            normalizeMediaItem({ id: 'a', createAt: '111' }, 'p'),
        ).not.toHaveProperty('createdAt');
    });

    it('两者都无 → 不凭空造 createdAt', () => {
        expect(normalizeMediaItem({ id: 'a' }, 'p')).not.toHaveProperty(
            'createdAt',
        );
    });

    it('两个别名都非法 → 移除脏 createdAt', () => {
        expect(
            normalizeMediaItem({ id: 'a', createdAt: 'bad' }, 'p'),
        ).not.toHaveProperty('createdAt');
    });
});
