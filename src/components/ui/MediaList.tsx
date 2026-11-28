import { FlashList, type FlashListProps } from '@shopify/flash-list';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
    RefreshControl,
    StyleSheet,
    useWindowDimensions,
    View,
    type LayoutChangeEvent,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import {
    ContentUnavailable,
    type ContentUnavailableProps,
} from '@/components/ui/ContentUnavailable';
import { Loading } from '@/components/ui/Loading';
import { space, useColors } from '@/design';
import { useLayoutClass } from '@/hooks/useLayoutClass';
import { useT } from '@/i18n';

import { LocateCurrentButton } from './locateCurrent/LocateCurrentButton';
import { useLocateCurrent } from './locateCurrent/useLocateCurrent';
import { locateGutterFor, mediaRowContainerFor } from './mediaListLayout';

// FlashList 包成 reanimated 动画组件：onScroll 走 UI 线程，供头部滚动联动
const AnimatedFlashList = Animated.createAnimatedComponent(
    FlashList,
) as unknown as typeof FlashList;

interface MediaListProps<T> {
    data: readonly T[];
    renderItem: (info: { item: T; index: number }) => ReactElement | null;
    keyExtractor: (item: T, index: number) => string;
    /** 初次加载中：配合无数据时显示全屏 spinner */
    isLoading?: boolean;
    /** 下拉刷新中 */
    isRefreshing?: boolean;
    /** 提供则接入下拉刷新 */
    onRefresh?: () => void;
    /** 是否还有下一页：决定触底是否翻页、footer 是否显示 */
    hasNextPage?: boolean;
    /** 正在翻下一页：footer 显示行内 spinner */
    isFetchingNextPage?: boolean;
    /** 翻下一页失败：footer 显示重试按钮，暂停触底自动翻页（改由用户手动重试） */
    isFetchNextPageError?: boolean;
    onEndReached?: () => void;
    /** footer 重试回调（配合 isFetchNextPageError） */
    onRetryNextPage?: () => void;
    /** 无数据时的空态；布局由列表独占，故不接受 style */
    empty: Omit<ContentUnavailableProps, 'style'>;
    /** 列表头部：随列表滚动（用于封面头等）；首屏加载中也保持挂载 */
    ListHeaderComponent?: ReactElement | null;
    /** 滚动回调：传 reanimated 的 useAnimatedScrollHandler 结果即走 UI 线程 */
    onScroll?: FlashListProps<T>['onScroll'];
    /** onScroll 采样频率（JS 线程 handler 用），默认 16 */
    scrollEventThrottle?: number;
    /** 透传内容容器样式（如底部安全区 padding） */
    contentContainerStyle?: StyleProp<ViewStyle>;
    /** 列数：默认 1（单列）；传 2+ 走规则网格（如专辑封面格），ListHeader / Footer / Empty 仍全宽跨列 */
    numColumns?: number;
    /**
     * 行已被外层分栏容器约束过：限宽只按 `listMaxWidth` 兜底，不再按窗口宽套手机档的 640
     * 分栏页（本地音乐横屏）传 true；单列页不传
     */
    inPane?: boolean;
    /** 数据变化时是否锚定当前可见项（FlashList MVCP，默认开、利于分页）；会整体重排的列表（如排序）传 false，避免重排后跳位 */
    maintainVisibleContentPosition?: boolean;
    /** 点列表项时对软键盘的处理；搜索类列表传 'handled'，键盘开着也能一次点中项（默认 FlashList 的 'never' 需先收键盘） */
    keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
    /**
     * 开启「定位到当前曲」浮标：滑动时若当前曲不在可视区，右下角浮出一个按钮、点了跳过去
     *
     * 只给**曲目列表**开（data 是 MusicItem）：判定按 mediaKey 在 data 里查下标，
     * 歌单 / 专辑这类非曲目列表查不到、浮标恒不出现，开了也只是白建一张表。
     * 不开时**渲染树与原生侧开销都不新增**：提前 return 裸列表、不多包容器、
     * 不挂 viewability 回调（`onViewableItemsChanged` 为 undefined 时 FlashList
     * 连 helper 都不注册，逐帧可视性计算整个跳过）、也不订阅原生读屏事件。
     * 仍会付的只有 useLocateCurrent 里那十几个 useState/useRef/useCallback 记账——
     * 同屏并存的 MediaList 只有两三个，这点代价没有必要为它把本组件拆成两个
     *
     * 与 `locateKey` 配对：本 prop 是**结构性**开关（页面静态决定，切歌不会让列表重挂），
     * key 才是动态值
     *
     * **本 prop 必须对同一个列表实例恒定，不能中途翻**：FlashList v2 的
     * ViewabilityManager 只在构造时看 `onViewableItemsChanged` 在不在，
     * 那一刻是 undefined 就整个 helper 都不注册，此后再补也永远不上报可视项
     *
     * 目前只开在「有固定曲目列表、且可能长到把当前曲滚出视野」的四处：本地音乐「全部」、
     * 集合歌曲栏、歌单/集合详情、下载已完成。歌手作品与列表内搜没开是刻意的——
     * 它们是远端分页列表，当前曲常常还没加载进来、浮标恒不出现，开了只是白建一张表
     */
    locateCurrent?: boolean;
    /**
     * 要定位到的那一项的 key（本仓即当前曲的 mediaKey）；null = 当前无可定位项
     *
     * 由调用方传入而非本组件读播放器：components 是纯 UI 层，不能 import core
     */
    locateKey?: string | null;
}

/**
 * 通用媒体列表容器：FlashList + 标准的加载 / 空 / 下拉刷新 / 触底翻页态
 * 对每项的视觉类型无认知，具体行由调用方经 renderItem 提供
 *
 * **宽屏限宽在行上，不在内容容器上。** 单列列表在平板 / 横屏下若铺满整宽，
 * 一行就是「左边一个小封面 + 一大片空白」，点击区还成了 1024×64 的长条。
 * 但限宽不能加到 `contentContainerStyle`：FlashList 的列宽与滚动量算基于它
 * 自己的宽度，收窄内容容器会让两者对不上；也不能把整个 FlashList 包进限宽容器，
 * 那样两侧留白会变成滚不动的死区。包在**行**上则三者兼得——量算不受影响、
 * 整宽都能滚、行本身（含涟漪与分割线）居中收窄。
 *
 * 网格（`numColumns > 1`）不走这条：等权封面格在宽屏下该**加列铺满**而不是留白，
 * 由调用方按宽度算列数。
 */
export function MediaList<T>({
    data,
    renderItem,
    keyExtractor,
    isLoading = false,
    isRefreshing = false,
    onRefresh,
    hasNextPage = false,
    isFetchingNextPage = false,
    isFetchNextPageError = false,
    onEndReached,
    onRetryNextPage,
    empty,
    ListHeaderComponent,
    onScroll,
    scrollEventThrottle = 16,
    contentContainerStyle,
    inPane = false,
    numColumns = 1,
    maintainVisibleContentPosition = true,
    keyboardShouldPersistTaps,
    locateCurrent = false,
    locateKey = null,
}: MediaListProps<T>) {
    const colors = useColors();
    const t = useT();
    const { width, height } = useWindowDimensions();
    const layoutClass = useLayoutClass();
    // 单列行的限宽容器：手机竖屏不包、横屏 > 640 且非矮窗才包旧容器（矮窗里宽度是唯一余量，
    // 不再留白），平板包内容列（840 + 平板内容线 32）。FlashList 的 contentContainerStyle
    // 只认 padding，限宽只能落在行上；不包时连多余的 View 都不产生
    const rowContainer = useMemo(
        () =>
            numColumns === 1
                ? mediaRowContainerFor(layoutClass, width, height, inPane)
                : undefined,
        [numColumns, layoutClass, width, height, inPane],
    );
    /*
     * 必须 memo：ViewHolder 的 memo 比较 `renderItem` 引用（FlashList 的
     * recyclerview/ViewHolder），这里每渲染新建一个箭头函数就等于每次 MediaList 渲染
     * 都让所有已挂载的行重渲染一遍。开浮标的列表在滚动期会渲染（见 useLocateCurrent），
     * 这条从「碰不到」变成「天天碰」，故一并收掉
     */
    const renderConstrained: typeof renderItem = useCallback(
        (info: { item: T; index: number }) =>
            rowContainer ? (
                <View style={rowContainer}>{renderItem(info)}</View>
            ) : (
                renderItem(info)
            ),
        [rowContainer, renderItem],
    );

    // 实测列表宽：算「行两侧留白」要用真实可用宽，不能拿窗口宽去减安全区（那是猜）
    const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
    /*
     * 行两侧留白 =（列表实宽 − 行限宽）/ 2；浮标据此再往里收，才落在行的右缘上。
     * 不用「把 rowContainer 套到浮标上」那条路：`left:0` 的绝对定位节点上 maxWidth 生效
     * 而 alignSelf 不生效（见 LocateCurrentButton 文件头），浮标会被钉在列表左缘
     */
    const rowGutter = useMemo(
        () => locateGutterFor(rowContainer, measuredWidth),
        [rowContainer, measuredWidth],
    );

    const onWrapperLayout = useCallback((event: LayoutChangeEvent) => {
        const next = event.nativeEvent.layout.width;
        // 同值时返回原值，保住 useState 的 bail-out
        setMeasuredWidth(prev => (prev === next ? prev : next));
    }, []);

    const locate = useLocateCurrent({
        enabled: locateCurrent,
        data,
        keyExtractor,
        targetKey: locateKey,
    });

    // 始终挂载列表：首屏加载 / 空态都经 ListEmptyComponent，保证 header 常在、空结果仍可下拉刷新
    const isEmpty = data.length === 0;
    const list = (
        <AnimatedFlashList
            ref={locateCurrent ? locate.listRef : undefined}
            {...(locateCurrent ? locate.listProps : null)}
            data={data}
            renderItem={renderConstrained}
            keyExtractor={keyExtractor}
            numColumns={numColumns}
            ListHeaderComponent={ListHeaderComponent}
            onScroll={onScroll}
            scrollEventThrottle={scrollEventThrottle}
            maintainVisibleContentPosition={
                maintainVisibleContentPosition ? undefined : { disabled: true }
            }
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            contentContainerStyle={StyleSheet.flatten([
                isEmpty && styles.emptyContent,
                contentContainerStyle,
            ])}
            // 翻页进行中或已失败都不再自动触发；失败后改由 footer 重试按钮手动拉取
            onEndReached={
                hasNextPage && !isFetchingNextPage && !isFetchNextPageError
                    ? onEndReached
                    : undefined
            }
            onEndReachedThreshold={0.5}
            refreshControl={
                onRefresh ? (
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                        colors={[colors.primary]}
                    />
                ) : undefined
            }
            ListEmptyComponent={
                isLoading ? (
                    <Loading variant="fullscreen" />
                ) : (
                    <ContentUnavailable {...empty} style={styles.fill} />
                )
            }
            ListFooterComponent={
                isFetchingNextPage ? (
                    <View style={styles.footer}>
                        <Loading variant="inline" />
                    </View>
                ) : isFetchNextPageError && onRetryNextPage ? (
                    <View style={styles.footer}>
                        <Button
                            variant="ghost"
                            size="sm"
                            onPress={onRetryNextPage}
                        >
                            {t('common.retry')}
                        </Button>
                    </View>
                ) : null
            }
        />
    );
    // 不开浮标时原样返回列表：既有调用方的渲染树一层不多
    if (!locateCurrent) {
        return list;
    }
    return (
        <View style={styles.fill} onLayout={onWrapperLayout}>
            {list}
            <LocateCurrentButton
                visible={locate.visible}
                onPress={locate.locate}
                rowGutter={rowGutter}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    // 空态占满内容区以便垂直居中
    emptyContent: {
        flexGrow: 1,
    },
    fill: {
        flex: 1,
    },
    footer: {
        alignItems: 'center',
        paddingVertical: space.lg,
    },
});
