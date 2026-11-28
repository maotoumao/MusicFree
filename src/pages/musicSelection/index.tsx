import { useRoute, type RouteProp } from '@react-navigation/native';
import { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { ContentColumn } from '@/components/layout/ContentColumn';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { showToast } from '@/components/overlay';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Loading } from '@/components/ui/Loading';
import { ReorderableMediaList } from '@/components/ui/reorderableMediaList/ReorderableMediaList';
import { useBackAction } from '@/hooks/useBackAction';
import { useEditableList } from '@/hooks/useEditableList';
import { useSelectionMode } from '@/hooks/useSelectionMode';
import { useT } from '@/i18n';
import { mediaKey } from '@/utils/media';

import { SelectionActionBar } from './components/SelectionActionBar';
import { useBatchActions } from './hooks/useBatchActions';
import {
    getSelectionSource,
    releaseSnapshot,
    type MusicSelectionParams,
} from './lib/sources';

import type { MediaRowContent } from '@/components/ui/reorderableMediaList/types';
import type { MusicItem } from '@/types';

export type { MusicSelectionParams };

/** 统一多选批量页：多来源导航进入，多选子集 + 批量操作（快照读 + 乐观即时写） */
export default function MusicSelectionScreen() {
    const t = useT();
    const back = useBackAction();
    const route =
        useRoute<
            RouteProp<
                { MusicSelection: MusicSelectionParams },
                'MusicSelection'
            >
        >();
    const source = useMemo(
        () => getSelectionSource(route.params),
        [route.params],
    );
    // generic 的快照跨 source 重建留存（claim 读即删），离页时释放
    const ticket =
        route.params.kind === 'generic' ? route.params.ticket : undefined;
    useEffect(
        () => () => {
            if (ticket !== undefined) {
                releaseSnapshot(ticket);
            }
        },
        [ticket],
    );
    const onWriteFailed = useCallback(
        () => showToast(t('feedback.operationFailed'), { type: 'error' }),
        [t],
    );
    const { status, items, canReorder, moveItem, applyRemoved, retry } =
        useEditableList(source, mediaKey, onWriteFailed);
    const selection = useSelectionMode(items, mediaKey);
    // 删除落地后同步快照（按 key）；选中集按 items 派生，失效 key 自动剔除
    const onRemoved = useCallback(
        (removed: readonly MusicItem[]) => applyRemoved(removed.map(mediaKey)),
        [applyRemoved],
    );
    const actions = useBatchActions(source, onRemoved);

    // 投影：曲名 + 「歌手 - 专辑」（缺歌手回退未知歌手）+ 音源平台标签
    const getItemContent = useCallback(
        (item: MusicItem): MediaRowContent => {
            const artistText =
                typeof item.artist === 'string' ? item.artist.trim() : '';
            const artist = artistText || t('media.unknownArtist');
            const album =
                typeof item.album === 'string' ? item.album : undefined;
            return {
                title: item.title,
                subtitle: [artist, album].filter(Boolean).join(' - '),
                sourceLabel: item.platform,
            };
        },
        [t],
    );

    return (
        // edges 空：top 由 AppBar 承接、bottom 由底部操作条承接（避免双份留白）
        <Screen edges={[]}>
            <AppBar
                title={t('musicSelection.selectedCount', {
                    count: selection.selectedCount,
                })}
                leading={{
                    icon: 'x',
                    label: t('common.cancel'),
                    onPress: back.onPress,
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
            {status === 'ready' ? (
                // 平板：列表收进媒体行内容列、横屏坐在纸上（Skia 画布按容器取宽，列表本身零改动）；手机两层壳都原样返回 children
                <PaperPane width="list">
                    <ContentColumn kind="list" style={styles.fill}>
                        <ReorderableMediaList
                            data={items}
                            keyExtractor={mediaKey}
                            getItemContent={getItemContent}
                            dragEnabled={canReorder}
                            onReorder={moveItem}
                            selectable
                            selectedKeys={selection.selectedKeys}
                            onToggleSelect={selection.toggle}
                            ListEmptyComponent={
                                <ContentUnavailable
                                    icon="list-music"
                                    title={t('musicSelection.empty')}
                                />
                            }
                        />
                    </ContentColumn>
                </PaperPane>
            ) : status === 'error' ? (
                <ContentUnavailable
                    icon="triangle-alert"
                    title={t('feedback.loadFailed')}
                    action={{ label: t('common.retry'), onPress: retry }}
                />
            ) : (
                <Loading variant="fullscreen" />
            )}
            <SelectionActionBar
                actions={actions}
                selectedItems={selection.selectedItems}
                onExecuted={outcome => {
                    // 仅业务真生效才清空选中：取消 / 失败保留选区好重试
                    if (outcome.applied) {
                        selection.clear();
                    }
                    if (outcome.disposition === 'close') {
                        back.onPress();
                    }
                }}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
});
