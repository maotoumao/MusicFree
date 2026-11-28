import { SUPPORTED_LOCALES } from '@/i18n';

import { configDefaults, configRules } from './types';

import { Config } from '.';

import type { ConfigKey } from './types';

// config/index.ts 模块级会建 MMKV store，且 hooks 依赖 useMMKVObject —— 这里只测值域规则，给最小替身
jest.mock('react-native-mmkv', () => ({ useMMKVObject: () => [undefined] }));
jest.mock('@/infra/storage', () => ({
    getOrCreateMMKV: () => ({ addOnValueChangedListener: () => ({}) }),
    getObject: () => undefined,
    setObject: () => true,
}));

const config = new Config();

describe('配置值域校验', () => {
    it('布尔项只认真正的布尔值', () => {
        expect(config.isValid('basic.autoUpdatePlugin', true)).toBe(true);
        expect(config.isValid('basic.autoUpdatePlugin', false)).toBe(true);
        expect(config.isValid('basic.autoUpdatePlugin', 'true')).toBe(false);
        expect(config.isValid('basic.autoUpdatePlugin', 1)).toBe(false);
    });

    it('字符串枚举：枚举外的值一律拒绝', () => {
        expect(config.isValid('lyric.fontSize', 'standard')).toBe(true);
        expect(config.isValid('lyric.fontSize', 'xlarge')).toBe(true);
        expect(config.isValid('lyric.fontSize', 'garbage')).toBe(false);
        expect(config.isValid('lyric.fontSize', 18)).toBe(false);

        expect(config.isValid('floatingLyric.mode', 'desktop')).toBe(true);
        expect(config.isValid('floatingLyric.mode', 'statusBar')).toBe(true);
        expect(config.isValid('floatingLyric.mode', 'card')).toBe(false);

        expect(config.isValid('basic.playQualityOrder', 'asc')).toBe(true);
        expect(config.isValid('basic.playQualityOrder', 'sideways')).toBe(
            false,
        );
    });

    it('音质枚举复用 isQualityKey', () => {
        expect(config.isValid('basic.defaultPlayQuality', 'super')).toBe(true);
        expect(config.isValid('basic.defaultDownloadQuality', 'low')).toBe(
            true,
        );
        expect(config.isValid('basic.defaultPlayQuality', 'lossless')).toBe(
            false,
        );
    });

    it('整数区间：端点通过、越界与非整数拒绝', () => {
        expect(config.isValid('basic.maxDownload', 1)).toBe(true);
        expect(config.isValid('basic.maxDownload', 5)).toBe(true);
        expect(config.isValid('basic.maxDownload', 0)).toBe(false);
        expect(config.isValid('basic.maxDownload', 6)).toBe(false);
        expect(config.isValid('basic.maxDownload', 3.5)).toBe(false);

        // 沿用 legacy 的 100MB–8192MB（字节）
        expect(config.isValid('basic.maxCacheSize', 100 * 1024 * 1024)).toBe(
            true,
        );
        expect(config.isValid('basic.maxCacheSize', 8192 * 1024 * 1024)).toBe(
            true,
        );
        expect(config.isValid('basic.maxCacheSize', 1024)).toBe(false);
        expect(config.isValid('basic.maxHistoryLen', 500)).toBe(true);
        expect(config.isValid('basic.maxHistoryLen', 0)).toBe(false);
    });

    it('连续区间：0–0.9 闭区间', () => {
        expect(
            config.isValid('floatingLyric.desktop.backgroundOpacity', 0),
        ).toBe(true);
        expect(
            config.isValid('floatingLyric.desktop.backgroundOpacity', 0.9),
        ).toBe(true);
        expect(
            config.isValid('floatingLyric.desktop.backgroundOpacity', 1),
        ).toBe(false);
        expect(
            config.isValid(
                'floatingLyric.desktop.backgroundOpacity',
                Number.NaN,
            ),
        ).toBe(false);
    });

    it('归一化位置：0–1 闭区间，越界与非数字拒绝', () => {
        expect(config.isValid('floatingLyric.desktop.positionY', 0)).toBe(true);
        expect(config.isValid('floatingLyric.desktop.positionY', 1)).toBe(true);
        expect(config.isValid('floatingLyric.desktop.positionY', 1.5)).toBe(
            false,
        );
        expect(config.isValid('floatingLyric.desktop.positionY', '0.5')).toBe(
            false,
        );
    });

    it('颜色格式：#RRGGBB 或 #RRGGBBAA', () => {
        expect(config.isValid('floatingLyric.textColor', '#FFFFFF')).toBe(true);
        expect(config.isValid('floatingLyric.textColor', '#ffffff80')).toBe(
            true,
        );
        expect(config.isValid('floatingLyric.textColor', '#FFF')).toBe(false);
        expect(config.isValid('floatingLyric.textColor', 'white')).toBe(false);
    });

    it('复合结构：均衡器增益 / 订阅源', () => {
        expect(config.isValid('audioEffect.eqGains', [0, -300, 500])).toBe(
            true,
        );
        expect(config.isValid('audioEffect.eqGains', [0, 'x'])).toBe(false);

        expect(
            config.isValid('plugin.subscribeUrl', [
                { name: 'a', url: 'https://ex/s.json' },
            ]),
        ).toBe(true);
        expect(config.isValid('plugin.subscribeUrl', [{ name: 'a' }])).toBe(
            false,
        );
    });

    it('缺值一律不合法（undefined / null 不能当作合法配置值写入）', () => {
        expect(config.isValid('basic.autoUpdatePlugin', undefined)).toBe(false);
        expect(config.isValid('lyric.fontSize', null)).toBe(false);
        expect(config.isValid('floatingLyric.desktop.positionY', null)).toBe(
            false,
        );
    });

    // satisfies 只保证「每个 key 有规则」且谓词不比类型更宽，管不了区间取值与枚举漏项 —— 以下用例补这两处盲区

    it('每个默认值都通过自己的规则（防默认表与规则表漂移）', () => {
        for (const [key, value] of Object.entries(configDefaults)) {
            const rule = configRules[key as ConfigKey];
            expect([key, rule(value)]).toEqual([key, true]);
        }
    });

    it('字面量枚举的每个合法成员都通过（防规则漏写某一项）', () => {
        const cases: [ConfigKey, readonly unknown[]][] = [
            // 语言取 i18n 的支持列表，新增语言时漏补规则即在此报错
            ['app.language', SUPPORTED_LOCALES],
            ['basic.playQualityOrder', ['asc', 'desc']],
            ['basic.downloadQualityOrder', ['asc', 'desc']],
            ['basic.defaultPlayQuality', ['low', 'standard', 'high', 'super']],
            [
                'basic.defaultDownloadQuality',
                ['low', 'standard', 'high', 'super'],
            ],
            ['basic.clickMusicInSearch', ['playMusic', 'playMusicAndReplace']],
            ['musicDetail.defaultView', ['cover', 'lyric']],
            [
                'playlist.defaultMusicSortMode',
                [
                    'manual',
                    'title',
                    'titleDesc',
                    'artist',
                    'artistDesc',
                    'album',
                    'albumDesc',
                    'addedAt',
                    'addedAtDesc',
                ],
            ],
            ['lyric.fontSize', ['small', 'standard', 'large', 'xlarge']],
            ['floatingLyric.mode', ['desktop', 'statusBar']],
        ];
        for (const [key, members] of cases) {
            for (const member of members) {
                expect([key, member, config.isValid(key, member)]).toEqual([
                    key,
                    member,
                    true,
                ]);
            }
        }
    });

    it('数值区间的上下边界（区间本身 satisfies 抓不到，只能靠用例锁）', () => {
        expect(config.isValid('basic.maxHistoryLen', 1)).toBe(true);
        expect(config.isValid('basic.maxHistoryLen', 1000)).toBe(true);
        expect(config.isValid('basic.maxHistoryLen', 1001)).toBe(false);

        expect(config.isValid('basic.downloadInterval', 0)).toBe(true);
        expect(config.isValid('basic.downloadInterval', 60_000)).toBe(true);
        expect(config.isValid('basic.downloadInterval', 60_001)).toBe(false);

        expect(
            config.isValid('basic.maxCacheSize', 8192 * 1024 * 1024 + 1),
        ).toBe(false);
    });

    it('桌面歌词字号：类型是 number，故区间内的小数也合法（档位表只约束 UI 取值）', () => {
        expect(config.isValid('floatingLyric.desktop.fontSize', 12)).toBe(true);
        expect(config.isValid('floatingLyric.desktop.fontSize', 24)).toBe(true);
        expect(config.isValid('floatingLyric.desktop.fontSize', 17.5)).toBe(
            true,
        );
        expect(config.isValid('floatingLyric.desktop.fontSize', 11.5)).toBe(
            false,
        );
        expect(config.isValid('floatingLyric.desktop.fontSize', 24.5)).toBe(
            false,
        );
    });
});
