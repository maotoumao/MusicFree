/**
 * 正在播放页·手机分栏：左栏封面 + 其下的进度，右栏标题 / 歌词 / 控件
 *
 * 与平板横屏（NowPlayingWide）刻意不同构：平板左栏 520dp 宽，够把封面 · 标题 · 工具行 ·
 * 进度 · 控件五样竖着堆完；手机横屏的栏高只有 300dp 上下，同样堆五样，封面必然被挤瘦
 * （改造前它实测只剩 1dp）。故这里把身份与控件搬到右栏，**左栏只留封面与其下的进度**——
 * 封面是方的、边长由栏高定（长到栏高减去让给进度的那一段）；左栏则比封面再宽出左右两段内距
 *
 * 进度条归**左栏**、排在封面下方，并**横跨整个左栏**（故比封面更宽）；
 * 右栏的控件行也贴栏底，于是两者落在同一条底边上。这么排让右栏的竖向账少 65dp
 * （进度 53 + 组间距 12），歌词在常态横屏窗口上因此回得来
 *
 * 封面退场的窗口（太窄，左栏整个不出现）没有左栏可放，进度回到右栏底部、控件之上 ——
 * 那正是改造前的排法，门槛也回到改造前的数（见 lib/layout 的两套门槛）
 *
 * 右栏三档降级（判据全在 lib/layout 的 playerPanesMetricsFor，只吃窗口 dp）：
 * - full：标题钉栏顶 · 歌词吃满中段（当前行居中）· 控件钉栏底
 * - brief：**同一套构图**，只是歌词那一段留空——不再把三样挤成一簇垂直居中
 *   （那样封面独占满栏高、右栏一大片空白，是改造前最难看的一档）
 * - strip：连 brief 都放不下（Android 多窗口能把窗口拖到 220dp 高）→ 标题并进控件行、
 *   进度在下（标题在栏太窄时让位、进度在栏太矮时让位，最后只剩那一行 44dp 的控件）
 *
 * 没有「封面 / 歌词」切换（两者同屏，切换无意义，与平板横屏一致），
 * 两条工具行收进顶栏右侧的「收藏 + 更多」（见 NowPlayingToolsMenu）
 *
 * 本形态是全屏沉浸页：状态栏与导航栏一起藏掉，用户从边缘滑出的栏只作临时覆盖、几秒后自动收回，
 * **滑出的那一次**不派发 insets——内容与顶栏不会跟着位移（视频播放器那种全屏）。横屏最缺的是高度，
 * 两栏合计约 48dp、占可用高一成多；常驻隐藏后 `insets.top` / `insets.bottom` 里**系统栏那一份**归零
 * （挖孔 / 桌面窗口标题栏仍在，长边挖孔机型与自由窗口下拿不到这些 dp，退化成无收益、不会遮挡）。
 * 判据吃真实 insets，多出来的高度自动流向更好的档位，门槛一行不用改。作用域见
 * `ImmersiveSystemBars`，两端机制差异见 `infra/systemBars`。本段与下面的数值都是 Android 口径：
 * iOS 只藏状态栏，而刘海 iPhone 横屏的状态栏高本就是 0，本形态在 iOS 上没有高度变化
 *
 * 只给播放页、且只给本形态：竖屏 / 平板走别的组件一行不碰；浏览类页面刻意不加——
 * 那是操作型页面，藏掉时钟/电量是净损失，临时滑出的栏还会盖住内容打断滚动。
 * 本页自己也吃这一口：导航栏藏掉后控件行贴到窗口底边，用户从底边滑出栏的那几秒，半透明的
 * 导航栏会压在播放 / 暂停那一行上——这是「不派发 insets、内容不位移」的另一面，属知情取舍
 * （视频播放器同样如此），几秒后自动收回
 *
 * 两处知情项：
 * - 分屏等多窗口下本形态也会出现（780 × 180 这种宽扁窗口就是 panes），未加闸。
 *   Android 官方说明多窗口下不能隐藏状态栏，故预期是无操作；真要加闸，正确的判据是
 *   原生 `Activity.isInMultiWindowMode()`（需经 native/specs 加一个方法），
 *   **不是**比较窗口尺寸与屏幕尺寸——那是几何关系、不是窗口模式
 * - insets 更新是异步的，故进出本页各有一次系统栏高度的瞬态落定：进场时挂载首帧
 *   `insets.top` / `insets.bottom` 还是旧值，要等原生回报 WindowInsets 才变；出场时 blur
 *   早于转场动画，系统栏会在本页往外滑的过程中压回来，旋回竖屏同理。多数窗口两侧同档、
 *   只是内容轻微位移；但栏高（含两条系统栏）落在 **145…200** 这条窄带的窗口那一刻会换构图
 *   而不只是换档：145…192 段跨过封面门槛 193（封面从无变有、进度从右栏跳到左栏），
 *   153…200 段跨过 full 门槛 201（brief ⇄ full、连带挂卸 LyricView）。两个下限都是
 *   「门槛减去状态栏 24 + 手势导航栏 24」；三键导航栏更高，窄带相应更宽
 */
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/layout/Screen';
import { Tag } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { useCurrentMusic } from '@/core/player';
import { layout, space } from '@/design';
import { useT } from '@/i18n';
import { mediaKey } from '@/utils/media';

import {
    PANES_COVER_PROGRESS_GAP,
    PLAYER_COMPACT_BOTTOM,
    PLAYER_PANES_COLUMN_GAP,
    PLAYER_PROGRESS_HEIGHT,
    playerPanesMetricsFor,
} from '../lib/layout';

import { Backdrop } from './Backdrop';
import { ImmersiveSystemBars } from './ImmersiveSystemBars';
import { KeepScreenAwake } from './KeepScreenAwake';
import { LyricView } from './LyricView';
import { NowPlayingNav } from './NowPlayingNav';
import { NOW_PLAYING_TOOLS_MENU } from './NowPlayingToolsMenu';
import { PlayControls } from './PlayControls';
import { PlayerCoverArt } from './PlayerCoverArt';
import { Progress } from './Progress';

import type { MusicItem } from '@/types';

export function NowPlayingPanes() {
    const insets = useSafeAreaInsets();
    const t = useT();
    const current = useCurrentMusic();
    const { width, height } = useWindowDimensions();
    // 顶栏无切换，位置值恒 0、不会被读到（NowPlayingNav 的下划线只在有切换时用）
    const navPosition = useSharedValue(0);

    // 左右安全区由 Screen 的 SafeAreaView 恒缩，上下由本页自加 → 可用宽高都要扣掉
    const { coverSize, leadPadding, sideForm, showIdentity, showProgress } =
        playerPanesMetricsFor(
            width - insets.left - insets.right,
            height - insets.top - insets.bottom,
        );

    const artwork = current?.artwork;
    const title = current?.title ?? t('media.unknownTitle');
    const key = current ? mediaKey(current) : 'none';
    const strip = sideForm === 'strip';

    return (
        <Screen background="coverVeil" edges={[]}>
            <KeepScreenAwake />
            <ImmersiveSystemBars />
            <Backdrop artwork={artwork} />
            <View
                style={[
                    styles.content,
                    { paddingTop: insets.top, paddingBottom: insets.bottom },
                ]}
            >
                <NowPlayingNav
                    position={navPosition}
                    mode="cover"
                    onModeChange={noop}
                    showModeSwitch={false}
                    compact
                    trailing={NOW_PLAYING_TOOLS_MENU}
                    // 标题挤不进右栏时改放顶栏中段（无切换，那一段本来是空占位）：
                    // 否则当前曲目在整页上无处可见，读屏也无从得知在放什么
                    middle={
                        showIdentity ? undefined : (
                            <Text
                                size="md"
                                weight="medium"
                                color="coverText"
                                numberOfLines={1}
                                style={styles.navTitle}
                            >
                                {title}
                            </Text>
                        )
                    }
                />
                <View
                    style={[
                        styles.columns,
                        // 封面退场 → 左右外距一并撤走，右栏与翻页版落在同一条 16dp 内容线上
                        // （metrics 的宽度账按这个口径算，两处必须同改）
                        coverSize > 0 && styles.columnsInset,
                    ]}
                >
                    {coverSize > 0 ? (
                        /*
                         * 左栏 = 封面 + 其下横跨整栏的进度条；整组贴栏底，与右栏控件行同一条底边
                         *
                         * `justifyContent: 'flex-end'` 让多余的高留在组的上方。别把封面
                         * **单独**包一层 `flex: 1` 再居中——那样封面由宽度封顶时（近方形窗口，
                         * 如可用 476 × 456：栏高 400 而封面只有 120）会把封面与进度拉开 117dp，
                         * 又变成一块小封面悬在栏中央。（改成整组 `center` 不会有这个问题，
                         * 两者仍隔 8dp；只是进度离栏底 109dp，与右栏控件行不再同一条底边）
                         */
                        <View
                            style={[
                                styles.artColumn,
                                { width: coverSize + 2 * leadPadding },
                            ]}
                        >
                            <PlayerCoverArt
                                artwork={artwork}
                                size={coverSize}
                            />
                            {/* 定高：与条带档那份同一个理由——Progress 的时间行没传
                                lineHeight、真实高由各端原生字体度量定，钉成预算值才让
                                「栏高够不够」是实测而非假设。钉住的是**布局占位**：
                                若某端字体让内部真高超过 53，文字会向下越出这个壳
                                （RN 默认不裁切），吃掉页面底距，而不会反过来挤小封面 */}
                            <View style={styles.paneProgress}>
                                <Progress key={key} />
                            </View>
                        </View>
                    ) : null}
                    <View style={styles.side}>
                        {strip ? (
                            <View style={styles.strip}>
                                <View style={styles.stripRow}>
                                    {showIdentity ? (
                                        <View style={styles.stripIdentity}>
                                            <IdentityStacked
                                                title={title}
                                                current={current}
                                            />
                                        </View>
                                    ) : null}
                                    {/* 标题让位时控件占满栏宽，五个键的两端与页底
                                        进度条的两端对齐；有标题时控件保持固有宽、靠右成簇 */}
                                    <View
                                        style={
                                            showIdentity
                                                ? undefined
                                                : styles.stripControlsFull
                                        }
                                    >
                                        <PlayControls scale="dense" />
                                    </View>
                                </View>
                                {/* 最后一档：栏高连 101 都不够时进度也让位，只留那行控件 */}
                                {showProgress ? (
                                    // 定高：条带档的 101dp 预算里进度占 53，而 Progress
                                    // 的时间行没传 lineHeight、真实高由原生字体度量定。
                                    // 这一层把它钉成预算值，让「101 装得下」是实测而非假设
                                    <View style={styles.stripProgress}>
                                        <Progress key={key} />
                                    </View>
                                ) : null}
                            </View>
                        ) : (
                            <View style={styles.stack}>
                                <IdentityRow title={title} current={current} />
                                {/*
                                 * 歌词槽恒占中段（flex: 1），full 才挂 LyricView、brief 留空：
                                 * 两档因此共用一套构图——标题钉栏顶、控件钉栏底。
                                 * 空槽不是浪费：它顶着控件贴栏底，正是 brief 不再是「悬空一簇」的原因
                                 *
                                 * key：换歌重挂让当前行回中
                                 */}
                                <View style={styles.lyricArea}>
                                    {sideForm === 'full' ? (
                                        <LyricView key={key} />
                                    ) : null}
                                </View>
                                {/* 封面退场 → 左栏没了，进度回到右栏底部、控件之上 */}
                                {coverSize > 0 ? null : <Progress key={key} />}
                                <PlayControls scale="compact" />
                            </View>
                        )}
                    </View>
                </View>
            </View>
        </Screen>
    );
}

/**
 * 右栏身份区（full / brief 档）：标题 · 艺人 · 音源**同一行**
 *
 * 横屏最缺的是高度，两行 48dp 收成一行 25dp，省下的 23dp 全给歌词
 * （块高见 lib/layout 的 SIDE_IDENTITY_BLOCK）。代价是标题不再独占整行：模拟器实测的常态
 * 窗口（780 × 360、上 0 下 24 安全区）右栏内宽 437 —— 艺人为空时标题实测拿到 ≈393dp
 * （只与音源标签分），带一个三字艺人约剩 ≈344，而艺人顶到 40% 上限时下界是 115。
 * 改造前标题独占整行 437。三者怎么分宽见 styles 处的说明
 */
function IdentityRow({
    title,
    current,
}: {
    title: string;
    current: MusicItem | null;
}) {
    return (
        <View style={styles.identityRow}>
            <Text
                size="xl"
                weight="bold"
                color="coverText"
                lineHeight="tight"
                numberOfLines={1}
                style={styles.identityTitle}
            >
                {title}
            </Text>
            {current?.artist ? (
                <Text
                    size="md"
                    color="coverTextSecondary"
                    lineHeight="tight"
                    numberOfLines={1}
                    style={styles.artist}
                >
                    {current.artist}
                </Text>
            ) : null}
            {current?.platform ? (
                <Tag
                    label={current.platform}
                    tone="cover"
                    accessibilityLabel={current.platform}
                    style={styles.platform}
                />
            ) : null}
        </View>
    );
}

/**
 * 右栏身份区（条带档）：与控件同一行、只剩几十 dp 宽 → 标题与艺人竖着叠
 *
 * 标题降到 md、艺人降到 xs，音源标签整个撤掉。与 `IdentityRow` 刻意分成两个组件而不是
 * 一个带 `inline` 布尔的组件：两支 JSX 零共用，而两个调用点各自静态决定走哪一支
 */
function IdentityStacked({
    title,
    current,
}: {
    title: string;
    current: MusicItem | null;
}) {
    return (
        <View>
            <Text
                size="md"
                weight="bold"
                color="coverText"
                lineHeight="tight"
                numberOfLines={1}
            >
                {title}
            </Text>
            {current?.artist ? (
                <Text
                    size="xs"
                    color="coverTextSecondary"
                    lineHeight="tight"
                    numberOfLines={1}
                >
                    {current.artist}
                </Text>
            ) : null}
        </View>
    );
}

function noop() {}

const styles = StyleSheet.create({
    content: {
        flex: 1,
    },
    columns: {
        flex: 1,
        flexDirection: 'row',
        gap: PLAYER_PANES_COLUMN_GAP,
        paddingBottom: PLAYER_COMPACT_BOTTOM,
    },
    columnsInset: {
        paddingHorizontal: layout.screenGutter,
    },
    /*
     * 左栏：封面与其下的进度成一组贴栏底，余高留在组上方
     *
     * 宽度是「封面 + 左右各一段内距」（运行时给）。`alignItems: 'center'` 让封面在其中
     * 居中，而进度靠 `alignSelf: 'stretch'` **横跨整个左栏** —— 那段内距就是「进度轨比
     * 封面长」的来源。别给 artColumn 加 paddingHorizontal：那会把进度一起缩进去，
     * 左栏白宽了而轨没变长
     */
    artColumn: {
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: PANES_COVER_PROGRESS_GAP,
    },
    paneProgress: {
        height: PLAYER_PROGRESS_HEIGHT,
        alignSelf: 'stretch',
    },
    // 右栏自留手机档内距：歌词画布的拖拽轨用 -screenGutter 的负偏移满幅铺开，靠的就是这一段
    // （与 NowPlayingWide 的 pane 同一处理；少了它，轨道会越过栏边压到封面上）
    side: {
        flex: 1,
        minWidth: 0,
        paddingHorizontal: layout.screenGutter,
    },
    stack: {
        flex: 1,
        gap: space.md,
    },
    // 标题 · 艺人 · 音源同一行；行高由最高的标题定（见 SIDE_IDENTITY_BLOCK）
    identityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
    },
    /*
     * 收缩策略：**给艺人与音源各自封顶**，剩下的宽都是标题的
     *
     * 不能只靠 flexShrink 权重排优先级 —— Yoga 按 `flexShrink × flexBasis` 分摊负空间，
     * 于是长艺人名会连带把标题一起拽到固有宽以下。右栏贴下限（内宽 268）时实测：
     * 标题 3 字 60 + 长艺人 190 + Tag 68 + 两个间距 16 = 334，溢出 66；
     * 按 1×60 与 3×190 分摊，标题只剩 53dp ≈ 2 个字，而艺人还留着 133dp。
     * 「艺人先让、标题最后让」在权重里根本做不到
     *
     * 改成上限法：艺人与音源**都不收缩、只各自封顶**（40% / 30%），标题是唯一可缩项。
     * 于是**留给标题的宽度**恒 ≥ 30% − 两个间距，与艺人多长无关（标题没有 flexGrow，
     * 短标题按自身内容宽排、不会去占满这个下界）
     *
     * 这个下界随右栏内宽走。全部可达窗口里最窄的是**无封面的 brief**：320 × 226 加
     * 59/34 的横屏刘海 → 可用宽 227 → 身份区内宽 195 → 下界 42.5dp；有封面时右栏
     * 外宽有 300 的下限、内宽最窄 268 → 下界 64.4dp。真机常态窗口内宽 437 → 下界 115dp。
     * 「够几个汉字」不作承诺 —— 字形宽度、字体回退与省略号本身都占宽
     *
     * 艺人**不能**留 `flexShrink: 1` —— 那会留下同一机制的镜像方向：艺人内容短于 40% 时
     * 它不被 Yoga 冻结（只有 clamp 生效的子节点才在第一趟被冻结），于是长标题
     * （flexBasis 极大）会按比例把它一起压掉。常态窗口下 21 字标题会把 3 字艺人压到
     * ≈1.9 字，40 字标题只剩一个「…」。改成 0 之后标题那份保证一分不减（唯一可缩项
     * 仍只有它），而艺人在 40% 以内恒得内容宽
     */
    identityTitle: {
        flexShrink: 1,
        // Yoga 不实现 CSS 的 min-width:auto，这一行是空操作；与本文件 side / stripIdentity 同惯例
        minWidth: 0,
    },
    artist: {
        flexShrink: 0,
        maxWidth: '40%',
    },
    platform: {
        flexShrink: 0,
        maxWidth: '30%',
    },
    // 歌词槽自己吃掉剩余高度，控件因此贴在栏底（brief 档槽是空的，作用相同）
    lyricArea: {
        flex: 1,
        minHeight: 0,
    },
    // 条带档：内容只有 101dp 高，整组居中让上下留白对称
    strip: {
        flex: 1,
        justifyContent: 'center',
        // 只给 xs：SeekBar 的 44 命中区里细轨居中，上方本就有约 20dp 视觉留白
        gap: space.xs,
    },
    // 控件是五个定尺寸命中壳、不收缩 → 剩余宽度全留给标题（标题 flex:1，不会有空档）
    stripRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
    },
    stripControlsFull: {
        flex: 1,
    },
    stripProgress: {
        height: PLAYER_PROGRESS_HEIGHT,
    },
    stripIdentity: {
        flex: 1,
        minWidth: 0,
    },
    // 顶栏中段那一段是 flex:1 的行，文字要能收缩才不会顶到两端的图标键上
    navTitle: {
        flexShrink: 1,
    },
});
