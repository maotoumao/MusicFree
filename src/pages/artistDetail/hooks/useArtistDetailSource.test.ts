import {
    deriveVisibleTypes,
    derivePageState,
    evidenceOf,
} from './artistWorksState';

describe('evidenceOf', () => {
    it('未启用（album 未探测）→ unprobed', () => {
        expect(evidenceOf(false, false, 0, false, false)).toBe('unprobed');
    });
    it('有数据、有项 → present', () => {
        expect(evidenceOf(true, true, 3, false, false)).toBe('present');
    });
    it('有数据、空且到底 → empty', () => {
        expect(evidenceOf(true, true, 0, false, false)).toBe('empty');
    });
    it('有数据、空但还有下一页 → loading（未确认空）', () => {
        expect(evidenceOf(true, true, 0, true, false)).toBe('loading');
    });
    it('无成功数据、首屏失败 → error', () => {
        expect(evidenceOf(true, false, 0, false, true)).toBe('error');
    });
    it('无成功数据、加载中 → loading', () => {
        expect(evidenceOf(true, false, 0, false, false)).toBe('loading');
    });
});

describe('deriveVisibleTypes', () => {
    it('不可加载 → 空', () => {
        expect(deriveVisibleTypes(false, 'unprobed', 'unprobed')).toEqual([]);
    });
    it('music 有 + album 未探测 → 乐观两 tab', () => {
        expect(deriveVisibleTypes(true, 'present', 'unprobed')).toEqual([
            'music',
            'album',
        ]);
    });
    it('music 有 + album 确认空 → 仍两 tab（album 空由其列表显空态、不隐藏 tab 免切后弹回）', () => {
        expect(deriveVisibleTypes(true, 'present', 'empty')).toEqual([
            'music',
            'album',
        ]);
    });
    it('music 首屏失败 → 保留 music 供重试（album 乐观）', () => {
        expect(deriveVisibleTypes(true, 'error', 'unprobed')).toEqual([
            'music',
            'album',
        ]);
    });
    it('music 空 + album 有 → 仅 album', () => {
        expect(deriveVisibleTypes(true, 'empty', 'present')).toEqual(['album']);
    });
    it('music 空 + album 失败 → 仅 album 供重试', () => {
        expect(deriveVisibleTypes(true, 'empty', 'error')).toEqual(['album']);
    });
    it('music 空 + album 探测中 → 空（转页面级 loading）', () => {
        expect(deriveVisibleTypes(true, 'empty', 'loading')).toEqual([]);
    });
    it('music 加载中 → 空（转页面级 loading）', () => {
        expect(deriveVisibleTypes(true, 'loading', 'unprobed')).toEqual([]);
    });
});

describe('derivePageState', () => {
    it('pending → loading', () => {
        expect(
            derivePageState(
                true,
                false,
                false,
                false,
                0,
                'unprobed',
                'unprobed',
            ),
        ).toBe('loading');
    });
    it('ticket 失效 / 插件缺失 → error', () => {
        expect(
            derivePageState(
                false,
                false,
                false,
                false,
                0,
                'unprobed',
                'unprobed',
            ),
        ).toBe('error');
    });
    it('实体在但插件未安装 → error', () => {
        expect(
            derivePageState(
                false,
                true,
                false,
                false,
                0,
                'unprobed',
                'unprobed',
            ),
        ).toBe('error');
    });
    it('插件在但不支持 getArtistWorks → unavailable', () => {
        expect(
            derivePageState(
                false,
                true,
                true,
                false,
                0,
                'unprobed',
                'unprobed',
            ),
        ).toBe('unavailable');
    });
    it('有可见 tab → ready', () => {
        expect(
            derivePageState(false, true, true, true, 2, 'present', 'unprobed'),
        ).toBe('ready');
    });
    it('music 首屏加载中 → loading', () => {
        expect(
            derivePageState(false, true, true, true, 0, 'loading', 'unprobed'),
        ).toBe('loading');
    });
    it('music 空 + album 探测中 → loading', () => {
        expect(
            derivePageState(false, true, true, true, 0, 'empty', 'loading'),
        ).toBe('loading');
    });
    it('music 空 + album 未探测 → loading（探测尚未落定）', () => {
        expect(
            derivePageState(false, true, true, true, 0, 'empty', 'unprobed'),
        ).toBe('loading');
    });
    it('两类都确认空 → empty', () => {
        expect(
            derivePageState(false, true, true, true, 0, 'empty', 'empty'),
        ).toBe('empty');
    });
});
