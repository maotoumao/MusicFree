/**
 * 横屏分栏的歌曲栏：当前选中集合（文件夹 / 专辑 / 艺术家）的歌曲
 *
 * 这里刻意**不复用** `widgets/musicCollectionDetail`：那一套自带 ImmersiveAppBar 与整屏封面头，
 * 在一条几百 dp 宽的栏里放不下，也会和本页顶栏叠两层 chrome。分栏只需要「紧凑头 + 歌曲 +
 * 播放全部」，数据同样来自 `core/localMusic` 的 `useCollectionMusic`——两种呈现共用一个 core
 * 口径，不是两份逻辑（故也不必把另一页的 source 适配器搬出来、跨 pages 引用）
 */
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { MediaList } from '@/components/ui/MediaList';
import { paneRowStyleFor } from '@/components/ui/mediaListLayout';
import { Text } from '@/components/ui/Text';
import { localMusic, useCollectionMusic } from '@/core/localMusic';
import { player } from '@/core/player';
import { borderWidth, space, useColors } from '@/design';
import { contentGutterFor } from '@/hooks/useContentColumn';
import { useLayoutClass } from '@/hooks/useLayoutClass';
import { useT } from '@/i18n';
import { mediaKey } from '@/utils/media';
import { useCurrentMusicKey } from '@/widgets/hooks/useCurrentMusicKey';
import { MusicRow } from '@/widgets/MusicRow';
import { showMusicItemOptionsPanel } from '@/widgets/overlays/MusicItemOptionsPanel';
import { PlayAllBar } from '@/widgets/PlayAllBar';

import { CollectionCover } from './CollectionCover';

import type { SelectedCollection } from '../store';
import type { IconName } from '@/components/ui/icons.generated';
import type { LocalCollectionView } from '@/core/localMusic';
import type { MusicItem } from '@/types';

/** 各视图缺图时的兑底图标，与竖屏各集合列表一致 */
const FALLBACK_ICON: Record<LocalCollectionView, IconName> = {
    folders: 'folder-open',
    albums: 'disc-3',
    artists: 'user-round',
};

export function CollectionMusicPane({
    selected,
}: {
    selected: SelectedCollection | null;
}) {
    const t = useT();
    const colors = useColors();
    const layoutClass = useLayoutClass();
    const currentKey = useCurrentMusicKey();
    // hook 需无条件调用；未选中时用空 key 查，core 返回空列表
    const musicList = useCollectionMusic(
        selected?.view ?? 'folders',
        selected?.collectionKey ?? '',
    );

    /*
     * 点歌 = 用本集合替换队列再播，与竖屏集合详情页一致
     * （`MusicRow` 的缺省行为是 `player.play(item)`，那是「插进现队列」，语义不同）
     */
    const playFrom = useCallback(
        (item: MusicItem) => {
            player.replaceQueueAndPlay(item, [...musicList]).catch(() => {});
        },
        [musicList],
    );
    const openItemOptions = useCallback((item: MusicItem) => {
        showMusicItemOptionsPanel({
            item,
            source: { kind: 'localLibrary' },
        });
    }, []);
    const renderItem = useCallback(
        ({ item, index }: { item: MusicItem; index: number }) => (
            <MusicRow
                item={item}
                position={index + 1}
                onPress={playFrom}
                onMore={openItemOptions}
            />
        ),
        [playFrom, openItemOptions],
    );

    if (!selected) {
        return (
            <View style={styles.pane}>
                <ContentUnavailable
                    icon="list-music"
                    title={t('localMusic.panes.pickCollection.title')}
                    description={t(
                        'localMusic.panes.pickCollection.description',
                    )}
                />
            </View>
        );
    }

    /*
     * 头与「全部播放」走列表头、**不固定**在栏顶
     *
     * 两者合计约 136dp（64 封面 + 上下 md 内距 + PlayAllBar 一行）。手机横屏这一栏
     * 只有 270dp 上下的高（360dp 窗口扣掉状态栏与顶栏），固定住就把 3/4 的高吃掉、
     * 歌曲只透得出一项——而这一栏的正事是看歌。平板横屏栏高够，滚不滚都不吃亏，
     * 故不按窗口分叉：一份行为两处都成立
     *
     * `MediaList` 的列表头在空态下也常在（见其 ListEmptyComponent 注释），所以
     * 「集合选中了但没有歌」仍看得见自己选的是哪个集合
     */
    const listHeader = (
        <>
            {/* 头的横向内距要跟着平板内容线走：它下面的 PlayAllBar 与歌曲行都落在 32，
                头写死 16 会让 64dp 封面的左沿比下面所有内容缩进一截 */}
            <View
                style={[
                    styles.header,
                    contentGutterFor(layoutClass),
                    { borderColor: colors.border },
                ]}
            >
                <CollectionCover
                    coverRef={localMusic.getCollectionCoverRef(
                        selected.view,
                        selected.collectionKey,
                    )}
                    fallbackIcon={FALLBACK_ICON[selected.view]}
                    size={64}
                />
                <View style={styles.headerText}>
                    <Text size="lg" weight="bold" numberOfLines={2}>
                        {selected.title}
                    </Text>
                    {/* 曲数不在此重复：紧下面的 PlayAllBar 就是「全部播放 · N 首」 */}
                    <Text size="sm" color="textSecondary" numberOfLines={1}>
                        {t(`localMusic.tabs.${selected.view}`)}
                    </Text>
                </View>
            </View>
            {/* 与下面的歌曲行用同一份限宽容器，否则栏够宽时两者外缘对不齐 */}
            <View style={paneRowStyleFor(layoutClass)}>
                <PlayAllBar musicList={musicList} />
            </View>
        </>
    );

    return (
        <View style={styles.pane}>
            <MediaList
                locateCurrent
                locateKey={currentKey}
                // key：换集合回到列表顶部，不继承上一个集合的滚动位
                key={`${selected.view}:${selected.collectionKey}`}
                inPane
                data={musicList}
                keyExtractor={mediaKey}
                renderItem={renderItem}
                ListHeaderComponent={listHeader}
                empty={{
                    icon: 'list-music',
                    title: t('localMusic.empty.title'),
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    pane: {
        flex: 1,
        minWidth: 0,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: borderWidth.hairline,
    },
    headerText: {
        flex: 1,
        minWidth: 0,
    },
});
