/*
 * 直接从 token 文件读，而不是从被 mock 的 `@/design` 桶读：这一条断言要守的正是
 * 「xl 真的比同行其余子节点高」这个 **token 关系**，硬写 15 / 12 就等于没守
 */
import { fontSize, lineHeightMultiplier } from '@/design/tokens/typography';

import {
    PLAYER_WIDE_NAV_ROW,
    playerColumnFor,
    playerCompactNavLeadingFor,
    playerContentInsetFor,
    playerCoverMaxSizeFor,
    playerFormFor,
    playerLeadWidthFor,
    playerPanesMetricsFor,
    playerPortraitNavRowFor,
} from './layout';

import type { PlayerForm } from './layout';

jest.mock('@/design', () => ({
    layout: jest.requireActual('@/design/tokens/layout').layout,
    iconSize: jest.requireActual('@/design/tokens/iconSize').iconSize,
    space: jest.requireActual('@/design/tokens/space').space,
    fontSize: jest.requireActual('@/design/tokens/typography').fontSize,
    lineHeightMultiplier: jest.requireActual('@/design/tokens/typography')
        .lineHeightMultiplier,
    breakpoints: jest.requireActual('@/design/tokens/breakpoints').breakpoints,
}));

describe('平板竖屏：翻页 + 内容列居中', () => {
    it('800 宽：560 内容列居中需要左右各 120，页面仍满宽（PagerView 子页不能收窄）', () => {
        expect(playerContentInsetFor(800)).toBe(120);
        expect(playerColumnFor(120)).toEqual({ paddingHorizontal: 120 });
    });

    it('窄折叠屏 600 宽：不足 560 + 2×32 时内距落到平板档 32', () => {
        expect(playerContentInsetFor(600)).toBe(32);
    });

    it('顶栏图标外推到内容列边线：120 − 12', () => {
        expect(playerPortraitNavRowFor(120)).toEqual({
            paddingHorizontal: 108,
        });
    });
});

describe('平板横屏：并排', () => {
    it('顶栏图标落在 48 内容线（32 外距 + 16 栏内距）', () => {
        expect(PLAYER_WIDE_NAV_ROW).toEqual({ paddingHorizontal: 36 });
    });

    it('左栏宽：常规平板 520，Pixel Fold 展开 840 收到 420，奇数宽按半宽不取整', () => {
        expect(playerLeadWidthFor(1280)).toBe(520);
        expect(playerLeadWidthFor(840)).toBe(420);
        expect(playerLeadWidthFor(841)).toBe(420.5);
    });

    it('封面封顶随左栏等比：520 → 400，420 → 323', () => {
        expect(playerCoverMaxSizeFor(520)).toBe(400);
        expect(playerCoverMaxSizeFor(420)).toBe(323);
    });
});

describe('手机形态判据', () => {
    /**
     * 「竖屏一行不改」的判据是「完整 chrome + 一块认得出的封面装得下」（可用高 ≥ 444），
     * 不是「高 ≥ 600」——后者会把 320 × 533 / 320 × 568 这类小屏竖屏也判成短窗口，
     * 把两条工具行收进溢出菜单。此处按规范钉住 320–430dp 竖屏全档
     */
    it('竖屏恒 tall（今天的翻页版一行不改）', () => {
        expect(playerFormFor(320, 568)).toBe('tall'); // iPhone SE 一代 / 5s
        expect(playerFormFor(320, 533)).toBe('tall'); // 480 × 800 hdpi Android
        expect(playerFormFor(360, 640)).toBe('tall');
        expect(playerFormFor(375, 667)).toBe('tall'); // iPhone SE2/3
        expect(playerFormFor(390, 844)).toBe('tall');
        expect(playerFormFor(412, 915)).toBe('tall');
        expect(playerFormFor(430, 932)).toBe('tall');
    });

    it('竖屏门槛：可用高 444 仍 tall，443 才收紧 chrome', () => {
        expect(playerFormFor(360, 444 + 48)).toBe('tall');
        expect(playerFormFor(360, 443 + 48)).toBe('compact');
    });

    it('手机横屏 / 折叠屏外屏横持走 panes', () => {
        expect(playerFormFor(915, 412)).toBe('panes');
        expect(playerFormFor(720, 400)).toBe('panes');
    });

    /**
     * 进度条排到封面下方后，封面要从栏高里再让出 73dp（进度 53 + 间距 8 + 不贴栏顶 12），
     * 于是 284 → 223；并排的宽度门槛同步从「高 + 240」降到「高 + 179」
     */
    it('封面为进度让出 73dp：640 × 400 上封面 223', () => {
        expect(playerFormFor(640, 400)).toBe('panes');
        expect(playerPanesMetricsFor(640, 400 - 48).coverSize).toBe(223);
    });

    /**
     * 「分栏给得更多」这一问要先于「翻页版还剩多少」：639 × 400 上分栏能同时给出
     * 223dp 封面与 168dp 歌词（栏高 296 − 标题 48 − 两处间距 24 − 控件 56），
     * 翻页版只剩 76dp 封面。否则门槛下方会紧贴着一段明显更差的布局
     */
    it('分栏能同时给出封面与歌词时，先于「翻页版还剩多少」', () => {
        expect(playerFormFor(639, 400)).toBe('panes');
        const m = playerPanesMetricsFor(639 - 48, 400 - 48);
        expect(m.coverSize).toBe(223);
        expect(m.sideForm).toBe('full');
    });

    /**
     * 上面那条其实已被**第一道宽度规则**接住（639 ≥ 400 + 179），压不住第二道
     * 「分栏画得出封面吗」。这条才压得住 —— 524 × 372 上第一道不成立
     * （524 < 372 + 179 = 551），而分栏画得出 120dp 封面；若删掉
     * `if (panes.coverSize > 0) return 'panes'`，它会落到 compact
     * （assumedColumnHeight 268 恰好 ≥ PAGER_DEGRADED_MIN 268）
     *
     * 「第一道不成立」只写在这段注释里、不写成断言：`PANES_WIDTH_MARGIN` 没导出，
     * 断言只能拿两个字面量比大小（`expect(524).toBeLessThan(551)`）——那是恒真的空断言，
     * margin 一改它照绿而用例前提已经不成立。为一条测试导出纯内部常量不划算
     */
    it('第一道宽度规则不成立时，靠「分栏画得出封面」接住', () => {
        expect(playerFormFor(524, 372)).toBe('panes');
        expect(playerPanesMetricsFor(524 - 48, 372 - 48).coverSize).toBe(120);
    });

    it('分屏那些矮而不宽的窗口走 compact', () => {
        expect(playerFormFor(457, 412)).toBe('compact'); // 横屏左右分屏
        expect(playerFormFor(412, 450)).toBe('compact'); // 竖屏上下分屏（可用 402 < 444）
    });

    it('极扁窗口仍并排（封面由尺寸函数决定要不要画）', () => {
        expect(playerFormFor(900, 220)).toBe('panes');
    });

    /**
     * 翻页版的标称地板 284 = 身份区 99（含 marginTop 12）+ 封面下限 64 + 传输 121。
     * 低于它**不一定**换分栏：窄窗口的分栏只会落到「无封面无歌词」的 brief，
     * 比小封面 + 可翻页歌词更差。故只有分栏确实能给出封面或歌词、
     * 或翻页版连身份区 + 一页歌词都放不下（栏高 < 220）时才换
     */
    /**
     * 兜底门槛 268 = 裁切线 220 + 安全区余量 48：判据只能用常量安全区（上下各 24），
     * 而真实安全区最坏是各 48。若门槛就设在 220，412 × 324 会被判成 compact
     * 「刚够」，渲染时真实栏高只有 172、身份区被裁掉 48dp
     */
    it('宽度不够并排（分栏画不出封面）的矮窗口留在 compact，直到翻页版真的塞不下', () => {
        expect(playerFormFor(412, 450)).toBe('compact');
        expect(playerFormFor(412, 372)).toBe('compact'); // 栏高 268，最坏安全区下刚不被裁
        expect(playerFormFor(412, 371)).toBe('panes'); // 栏高 267，余量吃完了
        expect(playerFormFor(412, 324)).toBe('panes');
        expect(playerFormFor(412, 220)).toBe('panes'); // Android 多窗口地板
    });

    /**
     * 判据必须在窗口高度上**单调**：逐 dp 升高时形态可以依次换（分栏 → 翻页 → 竖屏），
     * 但**同一形态不许离开后又回来**——每次往复都是一次整页重挂，
     * 歌词滚动位置与拖拽指示条各丢一次。曾经在 h ∈ [388, 392] 有过这样一段 5dp 的夹层
     */
    /**
     * `sideForm` 的等级单调：两套门槛按「有没有封面」切换，若切换那一刻门槛升高
     * 就会出现 full → brief → full 的倒退。两个轴都要扫——封面既由栏高定也由栏宽定
     *
     * 上一版只扫了 `playerFormFor`（换不换组件），没扫 `sideForm`（右栏降到哪一档）；
     * 而「装得下」的扫扫对倒退是盲的：错误地退成 brief 同样装得下
     */
    it('sideForm 的等级逐 dp 单调，两个轴都不倒退', () => {
        const rank = { strip: 0, brief: 1, full: 2 } as const;
        const regressions: string[] = [];
        // 高度轴
        for (let w = 320; w <= 1280; w += 4) {
            let best = -1;
            for (let h = 100; h < 1000; h++) {
                const r = rank[playerPanesMetricsFor(w - 48, h - 48).sideForm];
                if (r < best) {
                    regressions.push(`宽 ${w} 高 ${h}: 退到 ${r} < ${best}`);
                }
                best = Math.max(best, r);
            }
        }
        // 宽度轴
        for (let h = 100; h < 1000; h += 4) {
            let best = -1;
            for (let w = 200; w < 1600; w++) {
                const r = rank[playerPanesMetricsFor(w - 48, h - 48).sideForm];
                if (r < best) {
                    regressions.push(`高 ${h} 宽 ${w}: 退到 ${r} < ${best}`);
                }
                best = Math.max(best, r);
            }
        }
        expect(regressions.slice(0, 5)).toEqual([]);
    });

    it('固定宽度下逐 dp 升高，同一形态不会离开后又回来', () => {
        const offenders: string[] = [];
        for (let w = 320; w <= 1280; w += 1) {
            const seen: PlayerForm[] = [];
            let prev: PlayerForm | null = null;
            for (let h = 220; h < 600; h += 1) {
                const form = playerFormFor(w, h);
                if (form === prev) {
                    continue;
                }
                if (seen.includes(form)) {
                    offenders.push(
                        `${w}×${h}: ${form} 在 ${seen.join(
                            ' → ',
                        )} 之后又回来了`,
                    );
                    break;
                }
                seen.push(form);
                prev = form;
            }
        }
        expect(offenders.slice(0, 5)).toEqual([]);
    });
});

describe('分栏尺寸与右栏降级', () => {
    it('915 × 412（上下安全区各 24）：栏高 308、封面 235、右栏放得下歌词', () => {
        expect(playerPanesMetricsFor(915, 412 - 48)).toEqual({
            columnHeight: 308,
            coverSize: 235,
            leadPadding: 24,
            sideForm: 'full',
            showIdentity: true,
            showProgress: true,
        });
    });

    it('折叠屏外屏 720 × 400：封面随栏高收到 223', () => {
        expect(playerPanesMetricsFor(720, 400 - 48)).toEqual({
            columnHeight: 296,
            coverSize: 223,
            leadPadding: 24,
            sideForm: 'full',
            showIdentity: true,
            showProgress: true,
        });
    });

    /**
     * 有封面时 full 门槛 201 = 标题 25 + 两处间距 24 + 两行歌词 96 + 控件 56
     * （进度在左栏，不占右栏）。门槛处歌词区恰好 96；再矮一 dp 就整块让位，不留半行
     *
     * 标题那 25 是「标题 · 艺人 · 音源同一行」的行高（由最高的 xl 标题定）。改造前两行 48，
     * 合成一行省下的 23dp 直接体现在这个门槛上（224 → 201）
     *
     * 页面 chrome 56 = 顶栏 44 + 底距 12
     */
    it('歌词门槛（有封面）：栏高 201 仍给歌词，200 退 brief', () => {
        expect(playerPanesMetricsFor(915, 201 + 56).sideForm).toBe('full');
        expect(playerPanesMetricsFor(915, 200 + 56).sideForm).toBe('brief');
    });

    /**
     * 无封面时进度回到右栏，`stack` 变成 4 个子节点（标题 / 歌词槽 / 进度 / 控件）、
     * 3 个间距，两档门槛因此是 266 / 170。宽度取 332 + 32：够条带档站住标题，
     * 又远不够并排出封面（封面还要可用宽 ≥ 476）
     *
     * 间距按**子节点数**而非「看得见几样」数：歌词槽在 brief 档高度为零但照样渲染，
     * flex 的 gap 只看相邻子节点。按看得见的样数数会把两个 brief 门槛各少算 12dp，
     * 那正好是控件侵入页底预留区的量
     */
    it('歌词门槛（无封面）：266 / 170，间距按 4 个子节点算', () => {
        const narrow = 332 + 32;
        expect(playerPanesMetricsFor(narrow, 266 + 56).coverSize).toBe(0);
        expect(playerPanesMetricsFor(narrow, 266 + 56).sideForm).toBe('full');
        expect(playerPanesMetricsFor(narrow, 265 + 56).sideForm).toBe('brief');
        expect(playerPanesMetricsFor(narrow, 170 + 56).sideForm).toBe('brief');
        expect(playerPanesMetricsFor(narrow, 169 + 56).sideForm).toBe('strip');
    });

    it('横屏上下分屏 900 × 300：封面 123 仍值得画，但歌词放不下 → brief', () => {
        expect(playerPanesMetricsFor(900, 300 - 48)).toEqual({
            columnHeight: 196,
            coverSize: 123,
            leadPadding: 24,
            sideForm: 'brief',
            showIdentity: true,
            showProgress: true,
        });
    });

    /**
     * **条带档 ⟺ 栏高 < 170，与宽度无关**（170 = 无封面那套的 brief 门槛）
     *
     * 标题合成一行之后这条线从 193 降到 170，于是多出 170…192 这一段：那里栏高还够不上
     * 封面门槛 193、但已经够无封面那套的 brief，故是「无封面的 brief」。改造前 193 与封面
     * 门槛恰好相等、不存在这一段
     */
    it('条带档 ⟺ 栏高 < 170，与宽度无关', () => {
        expect(playerPanesMetricsFor(900, 170 + 56).sideForm).toBe('brief');
        expect(playerPanesMetricsFor(900, 169 + 56).sideForm).toBe('strip');
        // 窄到画不出封面：同一条栏高线上仍是 brief / strip 的分界
        expect(playerPanesMetricsFor(364, 170 + 56).coverSize).toBe(0);
        expect(playerPanesMetricsFor(364, 170 + 56).sideForm).toBe('brief');
        expect(playerPanesMetricsFor(364, 169 + 56).sideForm).toBe('strip');
        // 170…192 这一段：够 brief 但还画不出封面
        expect(playerPanesMetricsFor(900, 192 + 56).coverSize).toBe(0);
        expect(playerPanesMetricsFor(900, 192 + 56).sideForm).toBe('brief');
        expect(playerPanesMetricsFor(900, 193 + 56).coverSize).toBe(120);
    });

    it('极扁 900 × 220：不画封面（43 < 120）+ 条带档，标题仍站得住', () => {
        expect(playerPanesMetricsFor(900, 220 - 48)).toEqual({
            columnHeight: 116,
            coverSize: 0,
            leadPadding: 0,
            sideForm: 'strip',
            showIdentity: true,
            showProgress: true,
        });
    });

    /**
     * 条带档**必然没有封面**：条带档是栏高 < 170（见上一条），而封面要栏高 ≥ 193。
     * 论证不必依赖两区间相邻——有封面 ⟹ 栏高 ≥ 193 > 105（有封面那套的 brief 门槛）
     * ⟹ 必不是条带档，与宽度无关
     *
     * 改造前进度在右栏、brief 门槛 181 而封面门槛 132，132…181 之间既是条带档又画得出封面，
     * 于是右栏被封面压到 268、标题得让位给顶栏中段。进度搬出右栏后那一段消失了
     */
    it('条带档必无封面，右栏因此恒是满宽', () => {
        expect(playerPanesMetricsFor(500, 192)).toEqual({
            columnHeight: 136,
            coverSize: 0,
            leadPadding: 0,
            sideForm: 'strip',
            showIdentity: true,
            showProgress: true,
        });
        // 封面刚画得出的那一档已经是 brief，不再是条带
        expect(playerPanesMetricsFor(900, 193 + 56).sideForm).toBe('brief');
    });

    /**
     * 左栏内距（进度轨比封面长的那一段）**只从余量里拿**，取不到就不取
     *
     * 规律：封面被**栏高**封顶时才有余量（常态横屏），被**宽度**封顶时余量按定义就是 0。
     * 这么排的意义是「加内距不会把封面挤掉」——若反过来把 2 × 24 从封面的宽度预算里硬扣，
     * 可用宽 476…523 这段刚够并排的窗口会整个失去封面
     */
    it('左栏内距只从余量里拿，且不挤掉封面', () => {
        // 封面由栏高定、余量充足 → 拿满 24（739 × 360 是纯函数定点，不对应某台真机；
        // 模拟器实测的常态窗口是可用 780 × 336，见下一条）
        const phone = playerPanesMetricsFor(739, 360);
        expect(phone.coverSize).toBe(231);
        expect(phone.leadPadding).toBe(24);
        // 余量不足 24 时按余量给（591 处余量 12，两侧各 6）
        expect(playerPanesMetricsFor(591, 352).leadPadding).toBe(6);
        // 封面由宽度封顶 → 余量为 0，一点不拿；封面仍是改造前那个值
        expect(playerPanesMetricsFor(476, 400).coverSize).toBe(120);
        expect(playerPanesMetricsFor(476, 400).leadPadding).toBe(0);
        expect(playerPanesMetricsFor(500, 600).coverSize).toBe(144);
        expect(playerPanesMetricsFor(500, 600).leadPadding).toBe(0);
        // 没封面就没有左栏
        expect(playerPanesMetricsFor(900, 220 - 48).coverSize).toBe(0);
        expect(playerPanesMetricsFor(900, 220 - 48).leadPadding).toBe(0);
    });

    /**
     * 模拟器实测定点（1080 × 2340 @480dpi、横屏 780 × 360dp、Android 16 手势导航）：
     * 沉浸后 insets.top = 0、insets.left/right = 0、insets.bottom = 24（dumpsys 报
     * navigationBars frame 高 72px），故可用 780 × 336。截图量到左栏 255dp，
     * 由此反推封面 207 —— 与本断言一致。留着它，将来动门槛时能直接对上真机
     */
    it('模拟器实测窗口（可用 780 × 336）：封面 207、内距 24、左栏 255', () => {
        const real = playerPanesMetricsFor(780, 336);
        expect(real.columnHeight).toBe(280);
        expect(real.coverSize).toBe(207);
        expect(real.leadPadding).toBe(24);
        expect(real.coverSize + 2 * real.leadPadding).toBe(255);
        expect(real.sideForm).toBe('full');
        /*
         * 歌词区 = 栏高 − 身份区 − 两处间距 − 控件。身份区那一项从**真实 token** 取，
         * 不手抄 25 —— 手抄的话这一行化简后只是重复上面那句 columnHeight === 280
         */
        const identity = Math.ceil(fontSize.xl * lineHeightMultiplier.tight);
        expect(real.columnHeight - identity - 2 * 12 - 56).toBe(175);
    });

    /**
     * 余量是奇数时**向下**取整：宁可少给一 dp 内距，也不许让右栏跌破 300 下限。
     * 去掉 `Math.floor` 会返回 0.5 / 23.5 这类小数——扫扫的整数账不一定抓得住，
     * 故这里按定点钉死取整方向
     */
    it('内距按余量向下取整，不许多拿半个 dp', () => {
        // 580：余量 1 → 0.5 → 0
        expect(playerPanesMetricsFor(580, 352).leadPadding).toBe(0);
        // 626：余量 47 → 23.5 → 23
        expect(playerPanesMetricsFor(626, 352).leadPadding).toBe(23);
    });

    /**
     * 身份区块高只写了三个子节点里最高的那一个（xl 标题），`max` 是在推导里取的、代码里没有。
     * 这条断言把「xl 真的最高」钉在 **token 值关系**上：md 抬上去、或行高倍率变动都会红
     *
     * 它守不住的是 **Tag 组件的构成** —— 下面的 `tagHeight` 是把「xs × normal、且只有横向
     * 内距」这个前提**手抄**在这里，并没有引用 `Tag`。Tag 加一段 `paddingVertical`（>4.1dp
     * 就让行高越过 25）会让这条照绿而块高真的不够；换字号档倒是安全（连 lg × normal 也只
     * 23.8 < 25）。那一格属组件侧欠账（见提交信息）
     */
    it('身份区块高 ≥ 同行其余子节点的高（按 token 值关系）', () => {
        const titleHeight = Math.ceil(fontSize.xl * lineHeightMultiplier.tight);
        const artistHeight = Math.ceil(
            fontSize.md * lineHeightMultiplier.tight,
        );
        // Tag 是 Text：size xs + lineHeight normal，且只有横向内距
        const tagHeight = Math.ceil(fontSize.xs * lineHeightMultiplier.normal);
        expect(titleHeight).toBeGreaterThanOrEqual(artistHeight);
        expect(titleHeight).toBeGreaterThanOrEqual(tagHeight);
        // 门槛里用的就是这个数
        expect(playerPanesMetricsFor(915, 201 + 56).sideForm).toBe('full');
        expect(titleHeight).toBe(25);
    });

    /** 封面要从栏高让出 73dp（进度 53 + 间距 8 + 不贴栏顶 12），故门槛在栏高 193 */
    it('封面下限：算出 120 画，119 就整栏让位', () => {
        expect(playerPanesMetricsFor(900, 193 + 56).coverSize).toBe(120);
        expect(playerPanesMetricsFor(900, 192 + 56).coverSize).toBe(0);
    });

    /**
     * 条带档标题的宽度门槛 332 = 控件行 200（5 × 44 命中壳 − 两端各外推 10）
     * + 间距 12 + 一段能读的标题 120。栏内宽 = 可用宽 − 栏内左右内距 32（封面已退场）
     */
    it('条带档栏内宽装不下「控件 + 标题」时标题整块让位', () => {
        expect(playerPanesMetricsFor(332 + 32, 176).showIdentity).toBe(true);
        expect(playerPanesMetricsFor(332 + 31, 176).showIdentity).toBe(false);
    });

    it('封面退场后右栏必装得下 200dp 的控件行（Android 多窗口最窄 320 宽也够）', () => {
        const availableWidth = 320 - 48; // 320dp 窗口 − 左右安全区各 24
        expect(playerPanesMetricsFor(availableWidth, 220 - 48).coverSize).toBe(
            0,
        );
        expect(availableWidth - 2 * 16).toBeGreaterThanOrEqual(200);
    });

    /**
     * 条带档那 101dp 仍是定高块（44 控件 + 4 + 53 进度）：条带必无封面，进度因此在右栏里。
     * 真实上下安全区比判据假定的 48 大很多时（如 220dp 窗口上下各 48，栏高只有 68）
     * 进度也必须让位，否则整组上下各越界、压进顶栏
     */
    it('栏高连条带档的 101 都不够时进度让位，只剩 44dp 那行控件', () => {
        expect(playerPanesMetricsFor(900, 101 + 56).showProgress).toBe(true);
        expect(playerPanesMetricsFor(900, 100 + 56).showProgress).toBe(false);
        const worst = playerPanesMetricsFor(412 - 48, 220 - 96);
        expect(worst.sideForm).toBe('strip');
        expect(worst.showProgress).toBe(false);
        expect(worst.columnHeight).toBeGreaterThanOrEqual(44);
    });

    /** 纯函数边界，不是真实窗口：availableHeight 600 对应窗口高 ≳ 648，早被判 tall */
    it('窗口很高但很窄时由「右栏下限」封顶，不让封面吃掉歌词', () => {
        expect(playerPanesMetricsFor(500, 600)).toEqual({
            columnHeight: 544,
            coverSize: 144,
            leadPadding: 0,
            sideForm: 'full',
            showIdentity: true,
            showProgress: true,
        });
    });
});

/**
 * 全尺寸扫扫：320–1280dp 宽 × 220–599dp 高（manifest 把窗口地板钉在 320 × 220），
 * 4dp 步长逐格 × 上下安全区 7 档 × 左右安全区 4 档 —— 约 45 万个组合。
 * 断言选中的形态**按真实安全区渲染时**装得下自己的定高块，右栏 / 底部也放得下控件行
 *
 * 期望值在此重新写一遍而不是从被测模块 import——那样才是独立对照，
 * 而不是把同一个算术式抄两遍互相点头。判据吃常量安全区、渲染吃真实安全区，
 * 两者的偏差就是这一遍要压的东西
 */
describe('全尺寸不溢出扫扫', () => {
    /** [上, 下] 安全区档：0 / 手机竖屏 / 刘海横屏 / 上下分屏两半 / 状态栏 + 导航栏都最大 */
    const VERTICAL: readonly [number, number][] = [
        [0, 0],
        [24, 24],
        [48, 0],
        [0, 48],
        [24, 48],
        [59, 34],
        [48, 48],
    ];
    /** [左, 右] 安全区档：竖屏 0 / 常规 / 横屏刘海在左或右 */
    const HORIZONTAL: readonly [number, number][] = [
        [0, 0],
        [24, 24],
        [59, 34],
        [34, 59],
    ];
    const NAV = 44;
    const PROGRESS = 53;
    const BOTTOM = 12;
    const GUTTER = 16;
    const COLUMN_GAP = 24;
    /** 左栏里封面与其下进度的间距 + 封面不贴栏顶的边距（dp） */
    const COVER_PROGRESS_GAP = 8;
    const COVER_MARGIN = 12;
    /**
     * 右栏定高块（dp）：间距数按 `stack` 的**直接子节点数**推，不按「看得见几样」推
     *
     * 这一步是本轮的教训：上一版这里独立写了数字，但和实现共享了同一个错误假设
     * （按看得见的样数数间距），于是两个 brief 门槛各少算 12dp 而扫扫照绿。
     * 改成从 JSX 的子节点结构推——标题 / 歌词槽（恒渲染，brief 档高度为零）/
     * 进度（仅无封面）/ 控件——才是真正独立的对照
     */
    const sideBlockFor = (
        form: 'full' | 'brief',
        hasCover: boolean,
    ): number => {
        const kids = hasCover ? 3 : 4;
        const gaps = (kids - 1) * 12;
        const slot = form === 'full' ? 96 : 0;
        // 25 = 身份区一行的高（标题 · 艺人 · 音源同行，由最高的 xl 标题定）
        return 25 + slot + (hasCover ? 0 : 53) + 56 + gaps;
    };
    /** 左栏内距的上限（dp，单侧）；实际值只从余量里拿 */
    const LEAD_PADDING_MAX = 24;
    const STRIP_WITH_PROGRESS = 44 + 4 + 53;
    const STRIP_BARE = 44;
    /** 封面要画出来所需的最小栏高（dp）：120 + 进度 53 + 间距 8 + 边距 12 */
    const COVER_MIN_COLUMN = 120 + PROGRESS + COVER_PROGRESS_GAP + COVER_MARGIN;
    /**
     * 控件行的固有宽：4 个 44 命中壳 + 主键 − 两端各外推 10；
     * 装不下时 PlayControls 自量行宽、收掉循环键，只需 3 个壳 + 主键
     */
    const CONTROLS_TIGHT = { compact: 3 * 44 + 56 - 20, dense: 4 * 44 - 20 };
    /** 翻页版底部集群（进度 + 间距 + 播放键） */
    const PAGER_BOTTOM = 53 + 12 + 56;
    /** 翻页版还有定高身份区（含上边距）：低于此 PagerView 会把标题裁掉 */
    const PAGER_MIN = 99 + PAGER_BOTTOM;
    /** 竖屏完整 chrome 的定高块合计 */
    const FULL_CHROME = 380;
    /** 顶栏：返回键 + 尾部两键 + 两端 4dp 内距；分段的宽裕线（标签按 4 个字宽估） */
    const NAV_ENDS = 2 * 4 + 44 + (2 * 44 + 4);
    const NAV_SEGMENT_ROOMY = 2 * (4 * 15 + 2 * 8) + 1 + 2 * 4;

    const widths: number[] = [];
    for (let w = 320; w <= 1280; w += 4) {
        widths.push(w);
    }
    const heights: number[] = [];
    for (let h = 220; h < 600; h += 4) {
        heights.push(h);
    }

    it('每个窗口 × 安全区组合下，选中的形态都装得下', () => {
        const failures: string[] = [];
        for (const w of widths) {
            for (const h of heights) {
                const form = playerFormFor(w, h);
                for (const [left, right] of HORIZONTAL) {
                    const availableWidth = w - left - right;
                    /*
                     * 顶栏首部占位是宽度的纯函数：补它是为了让切换分段回到光学中心，
                     * 但只在补完之后分段仍宽裕时才补（标签本身可收缩，故这不是溢出线，
                     * 而是「别为配平把标签压成省略号」）
                     */
                    if (form === 'compact') {
                        const leading =
                            playerCompactNavLeadingFor(availableWidth);
                        const segment = availableWidth - NAV_ENDS - leading;
                        if (leading > 0 && segment < NAV_SEGMENT_ROOMY) {
                            failures.push(
                                `${w}×${h} 左右 ${left}/${right}: 补了占位却把分段压到 ${segment}dp`,
                            );
                        }
                    }
                    for (const [top, bottom] of VERTICAL) {
                        const availableHeight = h - top - bottom;
                        const at = `${w}×${h} 上下 ${top}/${bottom} 左右 ${left}/${right} → ${form}`;
                        if (form === 'tall') {
                            if (availableHeight < FULL_CHROME) {
                                failures.push(
                                    `${at}: 完整 chrome 差 ${
                                        FULL_CHROME - availableHeight
                                    }dp`,
                                );
                            }
                            continue;
                        }
                        if (form === 'compact') {
                            const column = availableHeight - NAV - BOTTOM;
                            if (column < PAGER_MIN) {
                                failures.push(
                                    `${at}: 身份区 + 底部集群差 ${
                                        PAGER_MIN - column
                                    }dp`,
                                );
                            }
                            if (
                                availableWidth - 2 * GUTTER <
                                CONTROLS_TIGHT.compact
                            ) {
                                failures.push(
                                    `${at}: 控件行差 ${
                                        CONTROLS_TIGHT.compact -
                                        (availableWidth - 2 * GUTTER)
                                    }dp`,
                                );
                            }
                            continue;
                        }
                        const m = playerPanesMetricsFor(
                            availableWidth,
                            availableHeight,
                        );
                        /*
                         * 右栏账：有封面时进度在左栏、右栏不含它；无封面时进度回到右栏。
                         * 这一式独立于 metrics 重推，两边对不上就是判据自己漂了
                         */
                        const block =
                            m.sideForm === 'strip'
                                ? m.showProgress
                                    ? STRIP_WITH_PROGRESS
                                    : STRIP_BARE
                                : sideBlockFor(m.sideForm, m.coverSize > 0);
                        const column = availableHeight - NAV - BOTTOM;
                        if (column < block) {
                            failures.push(
                                `${at}/${m.sideForm}: 竖向差 ${
                                    block - column
                                }dp`,
                            );
                        }
                        if (m.columnHeight !== Math.max(0, column)) {
                            failures.push(
                                `${at}: 栏高 ${m.columnHeight} ≠ 可用高 − 顶栏 − 底距 ${column}`,
                            );
                        }
                        /* 左栏竖向账：封面 + 间距 + 其下的进度不得超过栏高 */
                        if (
                            m.coverSize > 0 &&
                            m.coverSize + COVER_PROGRESS_GAP + PROGRESS >
                                m.columnHeight
                        ) {
                            failures.push(
                                `${at}: 左栏溢出——封面 ${m.coverSize} + 8 + 53 > 栏高 ${m.columnHeight}`,
                            );
                        }
                        /*
                         * 左栏横向账：内距只许从余量里拿，拿完右栏仍不得低于它的下限 300。
                         * 这一条守的是「加内距不许把右栏挤瘦」——也是「加内距不许挤掉封面」
                         * 的另一面（封面的尺寸预算里完全不含这段内距）
                         */
                        /** 左栏实际宽（封面 + 左右内距）；下面两处账都用它 */
                        const leadWidth =
                            m.coverSize > 0
                                ? m.coverSize + 2 * m.leadPadding
                                : 0;
                        if (m.coverSize > 0) {
                            const sideOuter =
                                availableWidth -
                                2 * GUTTER -
                                leadWidth -
                                COLUMN_GAP;
                            /*
                             * 不查「内距为负」：余量 = byWidth − coverSize 而
                             * coverSize ≤ byWidth，故它恒 ≥ 0，那是条死分支
                             */
                            if (m.leadPadding > LEAD_PADDING_MAX) {
                                failures.push(
                                    `${at}: 内距 ${m.leadPadding} 超过上限 ${LEAD_PADDING_MAX}`,
                                );
                            } else if (sideOuter < 300) {
                                failures.push(
                                    `${at}: 拿了 ${m.leadPadding} 内距后右栏只剩 ${sideOuter} < 300`,
                                );
                            }
                        } else if (m.leadPadding !== 0) {
                            failures.push(
                                `${at}: 无封面却给了 ${m.leadPadding} 内距`,
                            );
                        }
                        /*
                         * 条带档必无封面：有封面 ⟹ 栏高 ≥ 193 > 105（有封面那套的 brief
                         * 门槛）⟹ 必不是条带档。**不是**靠「两区间首尾相接」——标题合成
                         * 一行后条带门槛降到 170、与封面门槛 193 之间空着 23dp，那一段是
                         * 无封面的 brief。这条断言守住「条带档右栏恒满宽」，
                         * 而 showIdentity 的宽度账正是按满宽算的
                         */
                        if (m.sideForm === 'strip' && m.coverSize > 0) {
                            failures.push(
                                `${at}: 条带档却画了 ${m.coverSize}dp 封面`,
                            );
                        }
                        if (m.coverSize > 0 && column < COVER_MIN_COLUMN) {
                            failures.push(
                                `${at}: 栏高 ${column} 画不出封面却给了 ${m.coverSize}dp`,
                            );
                        }
                        /*
                         * 右栏内宽：左栏现在是「封面 + 左右内距」，比封面宽最多 48dp。
                         * 必须按左栏**实际宽**（上面那个 leadWidth）扣 —— 只扣 coverSize
                         * 会比渲染值大一截，那就又成了「测试与实现共享同一个错误假设」
                         */
                        const sideInner =
                            m.coverSize > 0
                                ? availableWidth -
                                  2 * GUTTER -
                                  leadWidth -
                                  COLUMN_GAP -
                                  2 * GUTTER
                                : availableWidth - 2 * GUTTER;
                        const need =
                            m.sideForm === 'strip'
                                ? CONTROLS_TIGHT.dense
                                : CONTROLS_TIGHT.compact;
                        if (sideInner < need) {
                            failures.push(
                                `${at}/${m.sideForm}: 右栏窄 ${
                                    need - sideInner
                                }dp`,
                            );
                        }
                    }
                }
            }
        }
        expect(failures.slice(0, 10)).toEqual([]);
    });
});
