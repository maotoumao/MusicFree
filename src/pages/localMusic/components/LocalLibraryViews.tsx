import { useNavigation } from '@react-navigation/native';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tabs } from '@/components/ui/Tabs';
import { borderWidth, useColors } from '@/design';
import { useT } from '@/i18n';

import { libraryLayoutFor, libraryRailWidthFor } from '../lib/layout';
import { libraryViewAtom, selectedCollectionAtom } from '../store';

import { AlbumsView } from './AlbumsView';
import { ArtistsView } from './ArtistsView';
import { CollectionMusicPane } from './CollectionMusicPane';
import { FoldersView } from './FoldersView';
import { LibraryRail, type LibraryRailItem } from './LibraryRail';
import { LocalMusicAllView } from './LocalMusicAllView';

import type { TabItem } from '@/components/ui/Tabs';
import type { LocalCollectionView, LocalMusicView } from '@/core/localMusic';

/**
 * 单个 Tab 页容器：绝对层叠，非激活层用 opacity 隐藏并屏蔽交互/无障碍
 * 保持 FlashList 挂载有布局（不像 display:none 触发 0 高度告警）、切回即时不重布局/不重派生
 */
function TabPage({
    active,
    children,
}: {
    active: boolean;
    children: ReactNode;
}) {
    return (
        <View
            style={[styles.page, active ? styles.shown : styles.hiddenLayer]}
            pointerEvents={active ? 'auto' : 'none'}
            importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
            accessibilityElementsHidden={!active}
        >
            {children}
        </View>
    );
}

/**
 * 有库时的四 Tab 容器：全部 / 文件夹 / 专辑 / 艺术家
 * Tab 固定在顶、各视图自持列表；曲目操作条随「全部」列表滚动（AllView 内）
 * 已访问视图懒挂载后保持挂载、仅切 display：切 Tab 不重挂载 FlashList/不重派生、保留各自滚动位置
 * Tab 选择态在页级 store（顶栏搜索按钮要读），重扫不重置；无库（待扫描/空/失败）不渲染本容器、无 Tab
 */
export function LocalLibraryViews() {
    const t = useT();
    const colors = useColors();
    const navigation = useNavigation();
    const [view, setView] = useAtom(libraryViewAtom);
    const [selected, setSelected] = useAtom(selectedCollectionAtom);
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    /*
     * 版式与三栏宽度一次算出：口径（都吃「窗口宽 − 左右安全区之和」）只在 lib/layout
     * 里有一处，组件不再自己推导，免得判据与列宽用上不同的宽（见 libraryLayoutFor 的说明）
     */
    const { form, usableWidth, railForm, collectionWidth } = libraryLayoutFor(
        width,
        height,
        insets.left + insets.right,
    );
    const panes = form === 'panes';
    // 懒挂载已访问视图：首次切到才挂载，之后保持挂载、仅切 display；切回无重挂载/重派生、保留滚动
    // 选择态在页级 store、可跨本容器的卸载重挂留存（清空库 / 权限变化），故按当前 view 播种、避免选中页未挂载留白
    const [visited, setVisited] = useState<Record<LocalMusicView, boolean>>(
        () => ({
            all: true,
            folders: false,
            albums: false,
            artists: false,
            [view]: true,
        }),
    );

    const selectView = useCallback(
        (next: LocalMusicView) => {
            setVisited(prev => (prev[next] ? prev : { ...prev, [next]: true }));
            if (next !== view) {
                // 换切法才清选中：在「专辑」里选的集合到了「艺术家」下无从解释；
                // 重按当前分类不该把右栏打回空态
                setSelected(null);
            }
            setView(next);
        },
        [view, setView, setSelected],
    );

    // 旋转回竖屏 / 窗口变窄退出分栏时清选中：右栏没了，留着它只会在转回横屏时突然复活
    useEffect(() => {
        if (!panes) {
            setSelected(null);
        }
    }, [panes, setSelected]);

    // 直接在 render 计算（不 useMemo）：useT 订阅 locale、切语言时组件重渲即取新标签
    // 一次成型：Tab 条与左栏读同一份，重排也不会图标错配
    const railItems: readonly LibraryRailItem[] = [
        { key: 'all', label: t('localMusic.tabs.all'), icon: 'list-music' },
        {
            key: 'folders',
            label: t('localMusic.tabs.folders'),
            icon: 'folder-open',
        },
        { key: 'albums', label: t('localMusic.tabs.albums'), icon: 'disc-3' },
        {
            key: 'artists',
            label: t('localMusic.tabs.artists'),
            icon: 'user-round',
        },
    ];
    const items: readonly TabItem<LocalMusicView>[] = railItems.map(
        ({ key, label }) => ({ key, label }),
    );

    /**
     * 点集合：分栏下填右栏，单列下压栈到详情页
     * 同一个回调交给三个集合视图，故它们不需要知道当前是哪种形态
     */
    const openCollection = useCallback(
        (
            collectionView: LocalCollectionView,
            collectionKey: string,
            title: string,
        ) => {
            if (panes) {
                setSelected({ view: collectionView, collectionKey, title });
                return;
            }
            navigation.navigate('LocalCollectionDetail', {
                view: collectionView,
                collectionKey,
                title,
            });
        },
        [panes, setSelected, navigation],
    );

    /*
     * 四个视图本体两种形态共用：单列下它们是 Tab 页，分栏下是中间那一列
     *
     * `paneWidth` 只在分栏时给：专辑是等权封面网格，列数得按**它自己那一栏**算，
     * 按窗口宽算会在 280~460dp 的列里排出 4~6 列、把封面压成缩略图。
     * 刻意不叫 availableWidth —— 那个词在 lib/layout 里指「整屏可用宽」，是另一件事
     */
    const renderPages = (paneWidth?: number) => (
        <View style={styles.content}>
            <TabPage active={view === 'all'}>
                <LocalMusicAllView />
            </TabPage>
            {visited.folders ? (
                <TabPage active={view === 'folders'}>
                    <FoldersView
                        onOpen={openCollection}
                        inPane={paneWidth !== undefined}
                    />
                </TabPage>
            ) : null}
            {visited.albums ? (
                <TabPage active={view === 'albums'}>
                    <AlbumsView
                        onOpen={openCollection}
                        availableWidth={paneWidth}
                    />
                </TabPage>
            ) : null}
            {visited.artists ? (
                <TabPage active={view === 'artists'}>
                    <ArtistsView
                        onOpen={openCollection}
                        inPane={paneWidth !== undefined}
                    />
                </TabPage>
            ) : null}
        </View>
    );

    if (panes) {
        // 「全部」没有第二级：让它横跨整个右区，不为它空出一条右栏
        const wide = view === 'all';
        return (
            <View style={styles.panes}>
                <LibraryRail
                    items={railItems}
                    value={view}
                    onChange={selectView}
                    form={railForm}
                />
                <View
                    style={
                        wide
                            ? styles.wideColumn
                            : [
                                  styles.collectionColumn,
                                  {
                                      width: collectionWidth,
                                      borderColor: colors.border,
                                  },
                              ]
                    }
                >
                    {renderPages(
                        wide
                            ? usableWidth - libraryRailWidthFor(railForm)
                            : collectionWidth,
                    )}
                </View>
                {wide ? null : <CollectionMusicPane selected={selected} />}
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Tabs items={items} value={view} onChange={selectView} />
            {renderPages()}
        </View>
    );
}

const styles = StyleSheet.create({
    panes: {
        flex: 1,
        flexDirection: 'row',
    },
    collectionColumn: {
        borderRightWidth: borderWidth.hairline,
    },
    wideColumn: {
        flex: 1,
        minWidth: 0,
    },
    container: { flex: 1 },
    content: { flex: 1 },
    page: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    shown: { opacity: 1, zIndex: 1 },
    hiddenLayer: { opacity: 0, zIndex: 0 },
});
