/**
 * 只测纯逻辑，故把 `@/design` 桶换成真值 token
 * （桶里 motion 引 reanimated 的 ESM 源码，jest 不转译它——与 musicDetail/lib/layout.test 同一处理）
 */
jest.mock('@/design', () => ({
    layout: jest.requireActual('@/design/tokens/layout').layout,
}));

import {
    libraryCollectionWidthFor,
    libraryFormFor,
    libraryLayoutFor,
    libraryRailFormFor,
    libraryRailWidthFor,
    LIBRARY_PANES_MIN_AVAILABLE_WIDTH,
    LIBRARY_RAIL_ICON_WIDTH,
} from './layout';

/**
 * 门槛在此**独立重算**，不从被测模块 import：图标栏 88 + 集合列下限 280 + 歌曲栏下限 320
 * = 688，**没有安全区余量假定**（口径是可用宽，不是窗口宽）
 */
const PANES_MIN = 88 + 280 + 320;
/** 标签档：navPaneWidth 280 + 集合列上限 460 + 歌曲栏下限 320 = 1060 */
const LABELLED_MIN = 280 + 460 + 320;

describe('门槛值', () => {
    it('与独立重算一致', () => {
        expect(LIBRARY_PANES_MIN_AVAILABLE_WIDTH).toBe(PANES_MIN);
        expect(LIBRARY_RAIL_ICON_WIDTH).toBe(88);
    });
});

describe('竖屏与窄窗口一律 stack', () => {
    /** 朝向按**窗口**宽高判，与安全区无关：这几个都是竖的 */
    it.each([
        [360, 800, '手机竖屏'],
        [412, 915, '手机竖屏大屏'],
        [800, 1280, '平板竖屏'],
        [1000, 1400, '平板竖屏大屏'],
    ])('%i × %i（%s）', (w, h) => {
        expect(libraryFormFor(w, h, 0)).toBe('stack');
    });

    /** 横过来但可用宽不够：小屏横屏、上下分屏、折叠外屏 */
    it.each([
        [568, 320, '小屏横屏'],
        [640, 360, '窄横屏'],
        [687, 400, '恰好差 1dp'],
    ])('%i × %i（%s，无安全区）', (w, h) => {
        expect(libraryFormFor(w, h, 0)).toBe('stack');
    });
});

describe('够横且可用宽够才 panes', () => {
    it.each([
        [688, 400, '恰好达线'],
        [915, 412, '手机横屏'],
        [1280, 800, '平板横屏'],
        [1366, 1024, '大平板横屏'],
        [900, 900, '正方形窗口'],
    ])('%i × %i（%s，无安全区）', (w, h) => {
        expect(libraryFormFor(w, h, 0)).toBe('panes');
    });
});

describe('判据吃真实安全区，且只吃两侧之和', () => {
    /**
     * 本次修复的核心。改造前门槛是「窗口宽 ≥ 784」（内含 96dp 猜测），于是
     * 780 × 360 的手机横屏（2340 × 1080 @3.0，实测应用区域 2218 × 1080、可用宽 739）
     * 被整个挡在 stack 外——横过来还是竖屏版式。现在按可用宽判：739 ≥ 688，进 panes
     */
    it('780 × 360 的手机横屏：可用宽 739 → panes（改造前是 stack）', () => {
        expect(libraryFormFor(780, 360, 41)).toBe('panes');
        expect(780 - 41).toBeGreaterThanOrEqual(PANES_MIN);
    });

    it('安全区真的很大时仍退回 stack —— 判据不是无条件放宽', () => {
        // 可用 780 − 96 = 684 < 688，差 4dp
        expect(libraryFormFor(780, 360, 96)).toBe('stack');
        // 恰好达线 / 差 1dp
        expect(libraryFormFor(780, 360, 780 - PANES_MIN)).toBe('panes');
        expect(libraryFormFor(780, 360, 780 - PANES_MIN + 1)).toBe('stack');
    });

    /*
     * 这里**不写**「同一个和的不同左右分配给出同一结构」那种断言：函数签名只收和，
     * 于是几种拆分是同一次调用重复几遍，`Set.size === 1` 由纯函数性保证、永不失败。
     * 真正的内容（系统会报出朝向无关的和）是平台假设，纯函数测不到——论证留在源码注释里
     */
    /**
     * 朝向按**窗口**宽高判、不按可用宽：750 × 700 且左右安全区共 62 时，
     * 窗口是横的（750 ≥ 700）、可用宽 688 恰好达线 → panes；
     * 若朝向误用可用宽（688 < 700）就会判成竖屏、退回 stack
     */
    it('朝向用窗口宽高，不用可用宽（横的那一侧）', () => {
        expect(libraryFormFor(750, 700, 62)).toBe('panes');
        expect(750 - 62).toBe(PANES_MIN);
    });

    /**
     * 竖的那一侧同样要钉：若朝向误写成 `width < height - horizontalInset`，
     * 712 × 730 且和为 24 时 712 ≥ 706 会被当成横屏，随后可用宽 688 达线 → 错判 panes
     */
    it('朝向用窗口宽高，不用可用宽（竖的那一侧）', () => {
        expect(libraryFormFor(712, 730, 24)).toBe('stack');
        expect(712 - 24).toBe(PANES_MIN);
    });
});

describe('左栏档位', () => {
    it('手机横屏走图标档、平板横屏走标签档（入参是可用宽）', () => {
        expect(libraryRailFormFor(739)).toBe('icon');
        expect(libraryRailFormFor(915)).toBe('icon');
        expect(libraryRailFormFor(1024)).toBe('icon');
        expect(libraryRailFormFor(1280)).toBe('labelled');
        expect(libraryRailFormFor(LABELLED_MIN)).toBe('labelled');
        expect(libraryRailFormFor(LABELLED_MIN - 1)).toBe('icon');
    });

    it('两档宽度分别是图标 88 与 navPaneWidth 280', () => {
        expect(libraryRailWidthFor('icon')).toBe(88);
        expect(libraryRailWidthFor('labelled')).toBe(280);
    });
});

describe('集合列宽度', () => {
    it('可用宽越宽越宽，但夹在下限与下限+180 之间', () => {
        // 688 刚过门槛：40% 是 275.2，低于下限 → 取下限 280，剩给歌曲栏恰好 320
        expect(libraryCollectionWidthFor(688)).toBe(280);
        expect(688 - 88 - 280).toBe(320);
        // 739（手机横屏可用宽）：40% = 295.6 → 296，剩给歌曲栏 355 ≥ 320
        expect(libraryCollectionWidthFor(739)).toBe(296);
        expect(739 - 88 - 296).toBe(355);
        // 915：40% = 366，剩 461 ≥ 320
        expect(libraryCollectionWidthFor(915)).toBe(366);
        // 极宽封顶在 280 + 180
        expect(libraryCollectionWidthFor(4000)).toBe(460);
        // 舍入方向：706 × 0.4 = 282.4，四舍五入 282（向上取整会给 283）
        expect(libraryCollectionWidthFor(706)).toBe(282);
    });

    it('无论多窄都不低于集合列下限，剩给歌曲栏的也不低于它的下限', () => {
        for (
            let available = LIBRARY_PANES_MIN_AVAILABLE_WIDTH;
            available <= 2000;
            available += 1
        ) {
            const rail = libraryRailWidthFor(libraryRailFormFor(available));
            const collection = libraryCollectionWidthFor(available);
            expect(collection).toBeGreaterThanOrEqual(280);
            // 歌曲栏拿剩下的；与判据同口径，不再扣任何假定安全区
            expect(available - rail - collection).toBeGreaterThanOrEqual(320);
        }
    });

    it('宽度单调：可用宽变宽，集合列不回缩', () => {
        let previous = 0;
        for (
            let width = LIBRARY_PANES_MIN_AVAILABLE_WIDTH;
            width <= 3000;
            width += 1
        ) {
            const collection = libraryCollectionWidthFor(width);
            expect(collection).toBeGreaterThanOrEqual(previous);
            previous = collection;
        }
    });

    it('歌曲栏也单调：左栏升档那一点不许让它一次跳掉一大截', () => {
        let previous = 0;
        for (
            let width = LIBRARY_PANES_MIN_AVAILABLE_WIDTH;
            width <= 3000;
            width += 1
        ) {
            const rail = libraryRailWidthFor(libraryRailFormFor(width));
            const music = width - rail - libraryCollectionWidthFor(width);
            // 升档那一点歌曲栏让出左栏多占的 192dp（88 → 280），别处不许回缩
            expect(music).toBeGreaterThanOrEqual(
                width === LABELLED_MIN ? previous - 192 : previous,
            );
            previous = music;
        }
    });
});

describe('全宽扫描：逐点对独立期望，不只数切换次数', () => {
    /**
     * 只断言「切换次数 ≤ 1」不够：那也接受**零次**切换，于是「某个安全区档永远不开
     * 分栏」这类保守退化会漏掉——实测把判据变异成
     * `if (horizontalInset === 24 || width < height)` 时，那一版扫描 24 条全绿。
     * 改成逐点比对独立重写的期望式，既抓永久 stack，也抓「过晚 / 过早进入 panes」
     */
    it('每个宽 × 高 × 安全区组合都等于独立重算的期望', () => {
        const mismatches: string[] = [];
        for (const height of [320, 400, 412, 600, 800]) {
            for (const inset of [0, 24, 41, 96]) {
                for (let width = 200; width <= 2000; width += 1) {
                    const expected =
                        width >= height && width - inset >= PANES_MIN
                            ? 'panes'
                            : 'stack';
                    const form = libraryFormFor(width, height, inset);
                    if (form !== expected && mismatches.length < 5) {
                        mismatches.push(
                            `${width}×${height} inset ${inset}: ${form} ≠ ${expected}`,
                        );
                    }
                }
            }
        }
        expect(mismatches).toEqual([]);
    });
});

describe('聚合口径：三栏宽度刚好铺满可用宽', () => {
    /**
     * 这一组守的是「判据与列宽同口径」：改造前那个不变量只活在组件里，把
     * `libraryCollectionWidthFor(usableWidth)` 误写成 `(width)` 没有任何测试会红，
     * 而后果是真的——窗口 780 / 安全区共 92（可用 688）时集合列按 780 算成 312，
     * 歌曲栏只剩 288 < 320。聚合到 libraryLayoutFor 之后，口径错配在这里就会现形
     */
    it('rail + collection + music === usableWidth，且歌曲栏不低于下限', () => {
        const problems: string[] = [];
        for (const inset of [0, 24, 41, 92, 96]) {
            for (let width = 200; width <= 2600; width += 1) {
                const l = libraryLayoutFor(width, 360, inset);
                if (l.form !== 'panes') {
                    continue;
                }
                const at = `${width}/${inset}`;
                if (l.usableWidth !== width - inset) {
                    problems.push(`${at}: usableWidth 错`);
                } else if (
                    l.railWidth + l.collectionWidth + l.musicWidth !==
                    l.usableWidth
                ) {
                    problems.push(`${at}: 三栏之和 ≠ 可用宽`);
                } else if (l.musicWidth < 320) {
                    problems.push(`${at}: 歌曲栏 ${l.musicWidth} < 320`);
                }
                if (problems.length >= 5) {
                    break;
                }
            }
        }
        expect(problems).toEqual([]);
    });

    it('聚合与单函数给出同一个 form', () => {
        for (const inset of [0, 41, 96]) {
            expect(libraryLayoutFor(780, 360, inset).form).toBe(
                libraryFormFor(780, 360, inset),
            );
        }
        expect(libraryLayoutFor(780, 360, 41).form).toBe('panes');
        expect(libraryLayoutFor(780, 360, 96).form).toBe('stack');
    });
});
