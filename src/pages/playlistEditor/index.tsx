import { useRoute, type RouteProp } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { ContentColumn } from '@/components/layout/ContentColumn';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { showToast } from '@/components/overlay';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Loading } from '@/components/ui/Loading';
import { ReorderableMediaList } from '@/components/ui/reorderableMediaList/ReorderableMediaList';
import { Tabs } from '@/components/ui/Tabs';
import { useBackAction } from '@/hooks/useBackAction';
import { useEditableList } from '@/hooks/useEditableList';
import { useSelectionMode } from '@/hooks/useSelectionMode';
import { useT } from '@/i18n';

import { SelectionActionBar } from './components/SelectionActionBar';
import {
    getPlaylistEditorSource,
    type PlaylistEditorRow,
    type PlaylistEditorTab,
} from './lib/sources';

import type { MediaRowContent } from '@/components/ui/reorderableMediaList/types';

/** 歌单管理页参数：进入时选中的范围（本地 / 收藏） */
export interface PlaylistEditorParams {
    tab?: PlaylistEditorTab;
}

const rowKey = (row: PlaylistEditorRow) => row.key;

/** 歌单管理页：拖拽排序 + 多选批量删除 / 取消收藏（快照读 + 即时写） */
export default function PlaylistEditorScreen() {
    const t = useT();
    const back = useBackAction();
    const route =
        useRoute<
            RouteProp<
                { PlaylistEditor: PlaylistEditorParams },
                'PlaylistEditor'
            >
        >();
    const [tab, setTab] = useState<PlaylistEditorTab>(
        route.params?.tab ?? 'local',
    );
    return (
        <Screen edges={[]}>
            {/* key=tab：切范围时整体重建，数据 / 选中 / 在途写一并丢弃，杜绝跨 tab 串扰 */}
            <PlaylistEditorTabView
                key={tab}
                tab={tab}
                onTab={setTab}
                onCancel={back.onPress}
                t={t}
            />
        </Screen>
    );
}

/** 单个范围的编辑视图：自持该范围的数据与选中态 */
function PlaylistEditorTabView({
    tab,
    onTab,
    onCancel,
    t,
}: {
    tab: PlaylistEditorTab;
    onTab: (tab: PlaylistEditorTab) => void;
    onCancel: () => void;
    t: ReturnType<typeof useT>;
}) {
    const source = useMemo(() => getPlaylistEditorSource(tab), [tab]);
    const onWriteFailed = useCallback(
        () => showToast(t('feedback.operationFailed'), { type: 'error' }),
        [t],
    );
    const { status, items, moveItem, applyRemoved, retry } = useEditableList(
        source,
        rowKey,
        onWriteFailed,
    );
    const selection = useSelectionMode(items, rowKey);

    // 展示文案在渲染期翻译：切语言即刷新，不被快照固化
    const getItemContent = useCallback(
        (row: PlaylistEditorRow): MediaRowContent => ({
            title: row.title.trim() || t('media.unknownTitle'),
            subtitle:
                row.musicCount !== undefined
                    ? t('media.songCount', { count: row.musicCount })
                    : row.artist?.trim() || undefined,
            sourceLabel: row.sourceLabel,
        }),
        [t],
    );

    const removeSelected = useCallback(async () => {
        const target = selection.selectedItems;
        if (target.length === 0) {
            return false;
        }
        // 确认与落地都在 source 内；false = 用户取消，保留选中好重试
        if (!(await source.remove(target))) {
            return false;
        }
        applyRemoved(target.map(rowKey));
        return true;
    }, [source, selection.selectedItems, applyRemoved]);

    return (
        <>
            <AppBar
                title={t('playlistEditor.selectedCount', {
                    count: selection.selectedCount,
                })}
                leading={{
                    icon: 'x',
                    label: t('common.cancel'),
                    onPress: onCancel,
                }}
                contentWidth="list"
                actions={[
                    {
                        label: selection.allSelected
                            ? t('common.unselectAll')
                            : t('common.selectAll'),
                        onPress: selection.toggleAll,
                        disabled: items.length === 0,
                        tone: 'text',
                    },
                ]}
            />
            {/* 平板：Tab 与列表同一内容列、横屏坐在纸上；手机两层壳都原样返回 children */}
            <PaperPane width="list">
                <ContentColumn kind="list">
                    <Tabs
                        items={[
                            { key: 'local', label: t('home.playlists.local') },
                            {
                                key: 'starred',
                                label: t('home.playlists.starred'),
                            },
                        ]}
                        value={tab}
                        onChange={onTab}
                    />
                </ContentColumn>
                {status === 'ready' ? (
                    <ContentColumn kind="list" style={styles.fill}>
                        <ReorderableMediaList
                            data={items}
                            keyExtractor={rowKey}
                            getItemContent={getItemContent}
                            onReorder={moveItem}
                            selectable
                            selectedKeys={selection.selectedKeys}
                            onToggleSelect={selection.toggle}
                            ListEmptyComponent={
                                <ContentUnavailable
                                    icon="list-music"
                                    title={t(
                                        tab === 'local'
                                            ? 'playlistEditor.emptyLocal'
                                            : 'playlistEditor.emptyStarred',
                                    )}
                                />
                            }
                        />
                    </ContentColumn>
                ) : status === 'error' ? (
                    <ContentUnavailable
                        icon="triangle-alert"
                        title={t('feedback.loadFailed')}
                        action={{ label: t('common.retry'), onPress: retry }}
                    />
                ) : (
                    <Loading variant="fullscreen" />
                )}
            </PaperPane>
            <SelectionActionBar
                action={source.action}
                disabled={selection.selectedCount === 0 || status !== 'ready'}
                onPress={removeSelected}
                onApplied={selection.clear}
            />
        </>
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
});
