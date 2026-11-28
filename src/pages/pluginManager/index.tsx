import { useNavigation } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { ContentColumn } from '@/components/layout/ContentColumn';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Spinner } from '@/components/ui/Spinner';
import { Text } from '@/components/ui/Text';
import { pluginManager, usePlugins } from '@/core/plugin';
import { borderWidth, layout, space, useColors } from '@/design';
import { useBackAction } from '@/hooks/useBackAction';
import { useContentColumn } from '@/hooks/useContentColumn';
import { useLayoutClass } from '@/hooks/useLayoutClass';
import { useT } from '@/i18n';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { PluginDetails } from '@/widgets/PluginDetails';

import { PluginRow } from './components/PluginRow';
import { useAddPlugin } from './hooks/useAddPlugin';
import { useSelectMode } from './hooks/useSelectMode';
import { useSortMode } from './hooks/useSortMode';
import { useSyncSubscriptions } from './hooks/useSyncSubscriptions';
import { useUpdateAllPlugins } from './hooks/useUpdateAllPlugins';

import type { Plugin } from '@/core/plugin';

/**
 * 插件管理页：normal 态提供列表/添加/溢出菜单，sorting 态排序、selecting 态多选；各态共用同一个 FlashList
 * 平板横屏 normal 态：左栏列表 + 右栏常驻详情（手机上点行开的底部面板同一份正文）
 */
export default function PluginManagerScreen() {
    const t = useT();
    const colors = useColors();
    const plugins = usePlugins();
    const back = useBackAction();
    const nav = useNavigation();
    const layoutClass = useLayoutClass();
    // 横屏右栏详情：行自带 16 内距，列再补 16 → 内容线 32；设置类行取阅读档
    const detailsColumn = useContentColumn('reading');
    // 横屏右栏当前显示的插件；未选 / 已卸载 → 回落列表首个
    const [selectedPlatform, setSelectedPlatform] = useState<string>();
    // 只清「没了的那一个」：卸载的异步尾巴可能在用户已选中别的插件之后才落地，不能连新选中的一起清掉
    const onDetailsGone = useCallback(
        (platform: string) =>
            setSelectedPlatform(prev => (prev === platform ? undefined : prev)),
        [],
    );
    const { promptAdd, installing } = useAddPlugin();
    const { updateAll, updating } = useUpdateAllPlugins();
    const { syncSubscriptions, syncing } = useSyncSubscriptions();
    const sort = useSortMode(plugins);
    const select = useSelectMode(plugins);
    const busy = installing || updating || syncing;
    // 忙碌提示文案：安装 / 同步 / 更新三态择一，兼作无障碍标签
    const busyLabel = t(
        installing
            ? 'pluginManager.add.installing'
            : syncing
            ? 'pluginManager.syncing'
            : 'pluginManager.updating',
    );

    // 溢出菜单（方案甲）：更新插件 / 同步订阅源 —— 插件排序 / 批量管理 —— 订阅源管理
    const openMenu = () => {
        // 无订阅源则同步无从谈起，置灰；每次开菜单现读（订阅源在子页编辑）
        const hasSubscriptions = pluginManager.getSubscriptions().length > 0;
        showActionSheetPanel({
            items: [
                {
                    icon: 'refresh-cw',
                    label: t('pluginManager.menu.updateAll'),
                    onPress: updateAll,
                },
                {
                    icon: 'cloud-download',
                    label: t('pluginManager.menu.syncSubscriptions'),
                    onPress: syncSubscriptions,
                    disabled: !hasSubscriptions,
                },
                {
                    icon: 'arrow-up-down',
                    label: t('pluginManager.sorting.title'),
                    onPress: () => sort.enter(),
                    separatorBefore: true,
                    // 安装/更新/同步中，以及插件少于 2 个时置灰；保留条目以维持菜单结构
                    disabled: busy || plugins.length < 2,
                },
                {
                    icon: 'list-checks',
                    label: t('pluginManager.menu.multiSelect'),
                    onPress: () => select.enter(),
                    // 无插件时置灰；批量管理本身不改动插件，忙碌中仍可进入
                    disabled: plugins.length === 0,
                },
                {
                    icon: 'rss',
                    label: t('pluginManager.menu.subscriptions'),
                    onPress: () => nav.navigate('PluginSubscriptions'),
                    separatorBefore: true,
                },
            ],
        });
    };

    // 横屏：列表常驻左侧同一父节点（切排序 / 多选不重挂、不丢滚动位）；只有 normal 态才有右栏详情，
    // 排序 / 多选是短任务，列表铺满整宽
    const landscape = layoutClass === 'tabletLandscape' && plugins.length > 0;
    const wide = landscape && !sort.sorting && !select.selecting;
    const activePlatform =
        wide && plugins.some(p => p.platform === selectedPlatform)
            ? selectedPlatform
            : plugins[0]?.platform;

    // 各态共用同一个 FlashList，切换模式时不重新挂载列表；行根据当前模式切换渲染
    const data = sort.sorting ? sort.orderedPlugins : plugins;
    const renderRow = ({ item, index }: { item: Plugin; index: number }) => {
        const row = sort.sorting ? (
            <PluginRow
                plugin={item}
                mode="sorting"
                position={index + 1}
                isFirst={index === 0}
                isLast={index === data.length - 1}
                onMove={sort.move}
            />
        ) : select.selecting ? (
            <PluginRow
                plugin={item}
                mode="selecting"
                selected={select.selected.has(item.platform)}
                onToggle={select.toggle}
            />
        ) : wide ? (
            <PluginRow
                plugin={item}
                position={index + 1}
                onLongPress={select.enter}
                onPress={setSelectedPlatform}
                selected={item.platform === activePlatform}
            />
        ) : (
            <PluginRow
                plugin={item}
                position={index + 1}
                onLongPress={select.enter}
            />
        );
        // 横屏双栏的左栏本身就是一列，不再套；其余（含平板竖屏三种模式）收进媒体行内容列，手机原样返回
        return wide ? row : <ContentColumn kind="list">{row}</ContentColumn>;
    };

    return (
        <Screen edges={['bottom']}>
            {sort.sorting ? (
                <AppBar
                    contentWidth="list"
                    title={t('pluginManager.sorting.title')}
                    leading={{
                        icon: 'x',
                        label: t('pluginManager.sorting.a11y.cancel'),
                        onPress: sort.cancel,
                        tone: 'textSecondary',
                    }}
                    actions={[
                        {
                            icon: 'check',
                            label: t('pluginManager.sorting.a11y.confirm'),
                            onPress: sort.confirm,
                            tone: 'primary',
                        },
                    ]}
                    style={{ backgroundColor: colors.primarySoft }}
                />
            ) : select.selecting ? (
                <AppBar
                    contentWidth="list"
                    title={t('pluginManager.selecting.title', {
                        count: select.selected.size,
                    })}
                    leading={{
                        icon: 'x',
                        label: t('pluginManager.selecting.a11y.exit'),
                        onPress: select.exit,
                        tone: 'textSecondary',
                    }}
                    actions={[
                        {
                            icon: 'list-checks',
                            label: select.allSelected
                                ? t('pluginManager.selecting.a11y.deselectAll')
                                : t('pluginManager.selecting.a11y.selectAll'),
                            onPress: select.toggleAll,
                        },
                        {
                            icon: 'trash-2',
                            label: t('pluginManager.selecting.a11y.uninstall'),
                            onPress: select.uninstallSelected,
                            disabled: select.selected.size === 0,
                            tone: 'danger',
                        },
                        {
                            icon: 'refresh-cw',
                            label: t('pluginManager.selecting.a11y.update'),
                            onPress: select.updateSelected,
                            disabled: select.selected.size === 0,
                        },
                    ]}
                    style={{ backgroundColor: colors.primarySoft }}
                />
            ) : (
                <AppBar
                    // 横屏双栏时顶栏通栏（返回键落在左栏边线），单列时对齐内容列
                    contentWidth={wide ? undefined : 'list'}
                    title={t('pluginManager.title')}
                    leading={back}
                    actions={[
                        {
                            icon: 'plus',
                            label: t('pluginManager.a11y.addPlugin'),
                            onPress: promptAdd,
                        },
                    ]}
                    overflow={{ onPress: openMenu }}
                />
            )}
            {!sort.sorting && busy ? (
                <View
                    accessible
                    accessibilityRole="progressbar"
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={busyLabel}
                    style={styles.busyBanner}
                >
                    {/* 行首槽对齐列表行的序号列，spinner 不再凸出到左侧 */}
                    <View style={styles.busyLeading}>
                        <Spinner size="sm" color="textSecondary" />
                    </View>
                    <Text size="sm" color="textSecondary">
                        {busyLabel}
                    </Text>
                </View>
            ) : null}
            {!sort.sorting && !select.selecting && plugins.length === 0 ? (
                <ContentUnavailable
                    icon="inbox"
                    title={t('pluginManager.empty')}
                    style={styles.empty}
                />
            ) : landscape ? (
                <View style={styles.panes}>
                    <View
                        style={
                            wide
                                ? [
                                      styles.listPane,
                                      { borderRightColor: colors.border },
                                  ]
                                : styles.empty
                        }
                    >
                        <FlashList
                            data={data}
                            keyExtractor={item => item.platform}
                            renderItem={renderRow}
                            extraData={activePlatform}
                            maintainVisibleContentPosition={{ disabled: true }}
                        />
                    </View>
                    {wide && activePlatform ? (
                        // 外壳满高 flex:1（row 轴），内层列容器再限宽居中（column 轴上 alignSelf 才是水平居中）
                        <View style={styles.detailsPane}>
                            <View style={[styles.detailsColumn, detailsColumn]}>
                                {/* key：换插件重挂正文，滚动位与导入中的 ref 不串 */}
                                <PluginDetails
                                    key={activePlatform}
                                    platform={activePlatform}
                                    active
                                    onGone={onDetailsGone}
                                />
                            </View>
                        </View>
                    ) : null}
                </View>
            ) : (
                // 平板横屏的排序 / 多选态与竖屏：单列坐在纸上（手机原样返回 children）
                <PaperPane width="list">
                    <FlashList
                        data={data}
                        keyExtractor={item => item.platform}
                        renderItem={renderRow}
                        maintainVisibleContentPosition={{ disabled: true }}
                    />
                </PaperPane>
            )}
        </Screen>
    );
}

const styles = StyleSheet.create({
    empty: {
        flex: 1,
    },
    panes: {
        flex: 1,
        flexDirection: 'row',
    },
    /** 横屏左栏：插件列表占详情侧栏宽（行在 390 宽的手机上就放得下），右缘 hairline */
    listPane: {
        width: layout.detailPaneWidth,
        borderRightWidth: borderWidth.hairline,
    },
    detailsPane: {
        flex: 1,
        minWidth: 0,
    },
    detailsColumn: {
        flex: 1,
        paddingTop: space.lg,
    },
    // 忙碌提示：paddingHorizontal、leading 槽宽、槽后间距均对齐 PluginRow，形成同一条左对齐线
    busyBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
    },
    busyLeading: {
        width: space.xl,
        alignItems: 'center',
    },
});
