import {
    DrawerContentScrollView,
    type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { useAtomValue } from 'jotai';
import { useCallback, useState } from 'react';
import {
    Platform,
    Pressable,
    StyleSheet,
    useWindowDimensions,
    View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePressFade } from '@/components/hooks/usePressFade';
import { SubstrateLayer } from '@/components/layout/SubstrateLayer';
import { SubstrateScope } from '@/components/layout/SubstrateScope';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import {
    borderWidth,
    iconSize,
    layout,
    radius,
    space,
    useColors,
    useHasBackgroundLayer,
} from '@/design';
import { localeAtom, LOCALE_NAMES, t, useT } from '@/i18n';
import { appVersion } from '@/infra/device';
import systemGates from '@/infra/systemGates';
import { useSleepTimerSummary } from '@/widgets/hooks/useSleepTimerSummary';
import { showLanguagePicker } from '@/widgets/overlays/languagePicker';
import { showSleepTimerPanel } from '@/widgets/overlays/SleepTimerPanel';

import type { DevStackParamList } from './routes';
import type { IconName } from '@/components/ui/icons.generated';
import type { NavigationProp } from '@react-navigation/native';

/** 抽屉能跳到的路由：正式目的地 + 无参 dev 屏，故可统一 navigate(route) */
type DrawerRoute =
    | 'PluginManager'
    | 'BackupRestore'
    | 'Appearance'
    | 'Settings'
    | 'About'
    | Extract<keyof DevStackParamList, `Dev${string}`>;

/** dev 屏标签不进 i18n：仅 __DEV__ 可见，翻译它没有受众 */
const DEV_ROUTES: readonly { route: DrawerRoute; label: string }[] = [
    { route: 'DevAudioProbe', label: 'Audio 冒烟' },
    { route: 'DevPlayerProbe', label: 'Player 冒烟' },
    { route: 'DevPlaylistProbe', label: 'Playlist 冒烟' },
    { route: 'DevComponentGallery', label: '组件展示' },
    { route: 'DevTagProbe', label: 'Tag 冒烟' },
    { route: 'DevLocalMusicProbe', label: '本地音乐扫描' },
    { route: 'DevReorderableListProbe', label: '拖拽重排' },
    { route: 'DevSkiaListSpike', label: 'Skia 列表 spike' },
    { route: 'DevSkiaRowCompare', label: 'Skia 行对比' },
    { route: 'DevSkiaMediaListProbe', label: 'Skia 媒体列表' },
    { route: 'DevDownloadProbe', label: '下载 冒烟' },
];

interface DrawerRowProps {
    icon: IconName;
    label: string;
    /** 尾部次要值（如定时关闭的剩余时间、关于的版本号）；不传则只有标签 */
    value?: string;
    onPress: () => void;
    /** 终止性动作：图标与标签转 danger 色（底色仍是中性 ripple） */
    danger?: boolean;
}

/** 抽屉里的一行：图标 + 标签 + 可选尾值 */
function DrawerRow({ icon, label, value, onPress, danger }: DrawerRowProps) {
    const colors = useColors();
    const { overlayStyle, onPressIn, onPressOut } = usePressFade();
    const color = danger ? 'danger' : 'text';
    return (
        <Pressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            accessibilityRole="button"
            accessibilityLabel={label}
            // 显式 label 会盖掉子树文本，尾部值得单独喂给读屏
            accessibilityValue={
                value !== undefined ? { text: value } : undefined
            }
            style={styles.row}
        >
            {/* 按压覆盖背景：铺满整行、淡入淡出、不拦截触摸 */}
            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: colors.ripple },
                    overlayStyle,
                ]}
            />
            <Icon
                name={icon}
                size="md"
                color={danger ? 'danger' : 'textSecondary'}
            />
            <Text size="md" color={color} style={styles.rowLabel}>
                {label}
            </Text>
            {value !== undefined ? (
                <Text size="sm" color="textSecondary">
                    {value}
                </Text>
            ) : null}
        </Pressable>
    );
}

/**
 * 定时关闭入口：尾值在倒计时期间每秒变，单独成组件把重渲关在这一行内
 * 同语言选择：开面板不关抽屉
 */
function SleepTimerDrawerRow() {
    const tr = useT();
    const summary = useSleepTimerSummary();
    return (
        <DrawerRow
            icon="clock"
            label={tr('sleepTimerPanel.title')}
            value={summary}
            onPress={() => showSleepTimerPanel()}
        />
    );
}

/** 开发工具：仅 __DEV__，折叠且默认收起——它不是正式功能，不该占用正文的扫读带宽 */
function DevSection({ go }: { go: (route: DrawerRoute) => void }) {
    const colors = useColors();
    const [expanded, setExpanded] = useState(false);
    const { overlayStyle, onPressIn, onPressOut } = usePressFade();
    return (
        <View>
            <Pressable
                onPress={() => setExpanded(value => !value)}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                accessibilityRole="button"
                accessibilityLabel="开发工具"
                accessibilityState={{ expanded }}
                style={styles.devRow}
            >
                <Animated.View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: colors.ripple },
                        overlayStyle,
                    ]}
                />
                <Icon name="code" size="sm" color="textDisabled" />
                <Text size="sm" color="textDisabled" style={styles.rowLabel}>
                    开发工具
                </Text>
                <Icon
                    name={expanded ? 'chevron-down' : 'chevron-right'}
                    size="sm"
                    color="textDisabled"
                />
            </Pressable>
            {expanded
                ? DEV_ROUTES.map(item => (
                      <Pressable
                          key={item.route}
                          onPress={() => go(item.route)}
                          accessibilityRole="button"
                          accessibilityLabel={item.label}
                          style={({ pressed }) => [
                              styles.devSubRow,
                              pressed
                                  ? { backgroundColor: colors.ripple }
                                  : null,
                          ]}
                      >
                          <Text size="sm" color="textDisabled">
                              {item.label}
                          </Text>
                      </Pressable>
                  ))
                : null}
        </View>
    );
}

/**
 * Home 抽屉：一列导航目的地 + 一个全局动作（定时关闭）+ 一个终止动作（退出应用）
 * 分组只靠间距、不加分组标题；唯一的分割线用来隔开贴底的部分（开发工具 / 退出应用）
 * 设计稿：docs/design/drawer.html
 */
export function DrawerContent(props: DrawerContentComponentProps) {
    const colors = useColors();
    const insets = useSafeAreaInsets();
    const hasBackground = useHasBackgroundLayer();
    const window = useWindowDimensions();
    // 订阅一次 locale：既驱动 t() 的重取，也给「语言」行取当前语言名
    const locale = useAtomValue(localeAtom);
    // 抽屉嵌在根 stack 内，跳其它路由取父导航；先关抽屉再跳，避免停留在新屏之上
    const rootNav =
        props.navigation.getParent<NavigationProp<DevStackParamList>>();
    const { closeDrawer } = props.navigation;
    const go = useCallback(
        (route: DrawerRoute) => {
            closeDrawer();
            rootNav?.navigate(route);
        },
        [closeDrawer, rootNav],
    );
    return (
        <View style={styles.root}>
            {/* 抽屉浮在首页之上，光靠半透明 surface 只会透出被压暗的首页内容——surface 可以被
                控件不透明度缩放，也可以被用户在取色器里直接设成半透明。外壳（HomeDrawer 的
                drawerStyle）已铺不透明的页面基底色；这里有壁纸就叠一层与页面同源、同坐标的壁纸
                （按窗口尺寸定位在左上角，露出的正好是页面上同一块；没壁纸时 SubstrateLayer 自己
                返回 null），再压自己的面色：半透明透出的永远是基底 / 壁纸，不是首页文字 */}
            <SubstrateLayer width={window.width} height={window.height} />
            <View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: colors.surface },
                ]}
            />
            {/* 抽屉不在 Screen 内，得自己声明「坐在壁纸上」，否则文字拿不到兜底阴影 */}
            <SubstrateScope onSubstrate={hasBackground}>
                <DrawerContentScrollView
                    // 抵消库注入的 12dp 横向内边距，让内容线回到全 App 统一的 16（安全区仍保留）
                    contentContainerStyle={[
                        styles.content,
                        { paddingStart: insets.left },
                    ]}
                >
                    <View style={styles.brand}>
                        <Text size="2xl" weight="bold">
                            MusicFree
                        </Text>
                    </View>

                    {/* 配置 App：装什么源、怎么用 */}
                    <DrawerRow
                        icon="puzzle"
                        label={t('pluginManager.title')}
                        onPress={() => go('PluginManager')}
                    />
                    <DrawerRow
                        icon="settings"
                        label={t('home.drawer.settings')}
                        onPress={() => go('Settings')}
                    />

                    <View style={styles.gap} />

                    {/* 呈现偏好 */}
                    <DrawerRow
                        icon="palette"
                        label={t('home.drawer.theme')}
                        onPress={() => go('Appearance')}
                    />
                    <DrawerRow
                        icon="languages"
                        label={t('home.drawer.language')}
                        value={LOCALE_NAMES[locale]}
                        // 开面板不关抽屉：关抽屉会触发导航 onStateChange → closeBlockingOverlays
                        // 把刚开的面板一并清掉；面板盖在抽屉之上，dismiss 后抽屉仍在
                        onPress={() => showLanguagePicker()}
                    />

                    <View style={styles.gap} />

                    {/* 全局动作 + 应用自身：一个搬运它的数据，一个陈述它的身份 */}
                    <SleepTimerDrawerRow />
                    <DrawerRow
                        icon="database"
                        label={t('home.drawer.backupRestore')}
                        onPress={() => go('BackupRestore')}
                    />
                    <DrawerRow
                        icon="info"
                        label={t('common.about')}
                        value={appVersion}
                        onPress={() => go('About')}
                    />

                    {/* 贴底：开发工具与退出应用都不属于正文入口，共用一条分割线隔开 */}
                    {__DEV__ || Platform.OS === 'android' ? (
                        <View style={styles.bottom}>
                            <View
                                style={[
                                    styles.separator,
                                    { backgroundColor: colors.border },
                                ]}
                            />
                            {__DEV__ ? <DevSection go={go} /> : null}
                            {/* iOS 的 exitApp 是 no-op，给个点了没反应的入口比不给更伤 */}
                            {Platform.OS === 'android' ? (
                                <DrawerRow
                                    icon="log-out"
                                    label={t('home.drawer.exitApp')}
                                    onPress={() => systemGates.exitApp()}
                                    danger
                                />
                            ) : null}
                        </View>
                    ) : null}
                </DrawerContentScrollView>
            </SubstrateScope>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        overflow: 'hidden',
        // 与 HomeDrawer 的 drawerStyle 同一个圆角：三层面色都是矩形，靠这里裁出右侧圆角
        borderTopRightRadius: radius.xl,
        borderBottomRightRadius: radius.xl,
    },
    // 撑满可视高度，让贴底区的 marginTop:auto 能把自己推到底
    content: {
        flexGrow: 1,
        paddingEnd: 0,
    },
    brand: {
        paddingHorizontal: layout.screenGutter,
        paddingTop: space.sm,
        paddingBottom: space.xl,
    },
    /** 组间距：本稿唯一的分组手段 */
    gap: {
        height: space.lg,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: layout.screenGutter,
        // 纯文本导航行：比列表行紧，一屏放得下全部目的地；触达下限仍由 hitTarget 兜
        minHeight: layout.listRowDenseMinHeight,
        // 按压覆盖层用 absoluteFill，需要本行作为定位参照
        overflow: 'hidden',
    },
    rowLabel: {
        flex: 1,
    },
    separator: {
        height: borderWidth.hairline,
        marginHorizontal: layout.screenGutter,
        marginVertical: space.sm,
    },
    /** 贴底区：开发工具 + 退出应用，被 marginTop:auto 推到抽屉底部 */
    bottom: {
        marginTop: 'auto',
    },
    devRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: layout.screenGutter,
        minHeight: layout.hitTarget,
        overflow: 'hidden',
    },
    devSubRow: {
        justifyContent: 'center',
        // 与折叠头的标签左对齐：内容线 + 图标宽 + 图标与标签的间距
        paddingLeft: layout.screenGutter + iconSize.sm + space.md,
        paddingRight: layout.screenGutter,
        minHeight: layout.hitTarget,
    },
});
