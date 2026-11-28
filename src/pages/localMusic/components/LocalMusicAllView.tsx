import { useNavigation } from '@react-navigation/native';
import { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContentColumn } from '@/components/layout/ContentColumn';
import { MediaList } from '@/components/ui/MediaList';
import { paneRowStyleFor } from '@/components/ui/mediaListLayout';
import { localMusic, useLocalMusicList, useLocalSort } from '@/core/localMusic';
import { player } from '@/core/player';
import { useLayoutClass } from '@/hooks/useLayoutClass';
import { useT } from '@/i18n';
import { mediaKey } from '@/utils/media';
import { useCurrentMusicKey } from '@/widgets/hooks/useCurrentMusicKey';
import { MusicRow } from '@/widgets/MusicRow';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showMusicItemOptionsPanel } from '@/widgets/overlays/MusicItemOptionsPanel';
import { PlayAllBar } from '@/widgets/PlayAllBar';

import { useLibraryInPane } from '../hooks/useLibraryInPane';

import type { LocalSortBy } from '@/core/localMusic';
import type { MusicItem } from '@/types';

/** 排序字段展示顺序（与 core 解耦） */
const SORT_BYS: readonly LocalSortBy[] = [
    'title',
    'artist',
    'addedAt',
    'duration',
];

/**
 * 「全部」曲目视图：PlayAllBar（全部播放·N首 + 排序 + 多选）+ 曲目列表
 * 扫描进度不在此内嵌——重扫走全屏进度覆盖（LocalMusicLibrary 编排），本视图只管列表浏览
 * TODO 加入歌单将由单曲菜单(M4e) 承载；播放模式（顺序/随机）由用户在播放器页 toggle
 */
export function LocalMusicAllView() {
    const currentKey = useCurrentMusicKey();
    // 分栏下本视图独占右区：行限宽交给 listMaxWidth 兜底，别再套手机档的 640
    const inPane = useLibraryInPane();
    const layoutClass = useLayoutClass();
    const paneRowStyle = paneRowStyleFor(layoutClass);
    const t = useT();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const musicList = useLocalMusicList();
    const sort = useLocalSort();

    const listContentStyle = useMemo(
        () => ({ paddingBottom: insets.bottom }),
        [insets.bottom],
    );

    const playFrom = useCallback(
        (item: MusicItem) => {
            player.replaceQueueAndPlay(item, musicList).catch(() => {});
        },
        [musicList],
    );
    // 多选批量管理：走统一多选页，来源为本地库全量（快照读 + 即时写，见 pages/musicSelection）
    const openMultiSelect = useCallback(() => {
        if (musicList.length === 0) {
            return;
        }
        navigation.navigate('MusicSelection', { kind: 'localLibrary' });
    }, [musicList, navigation]);
    const pickSort = useCallback(() => {
        showActionSheetPanel({
            title: t('media.sort'),
            items: SORT_BYS.flatMap(by =>
                [false, true].map(desc => ({
                    label: t(
                        `media.sortOption.${
                            desc ? (`${by}Desc` as const) : by
                        }`,
                    ),
                    selected: sort.by === by && sort.desc === desc,
                    onPress: () => localMusic.setSort({ by, desc }),
                })),
            ),
        });
    }, [sort, t]);

    const openItemMenu = useCallback((item: MusicItem) => {
        showMusicItemOptionsPanel({ item, source: { kind: 'localLibrary' } });
    }, []);

    const renderItem = useCallback(
        ({ item, index }: { item: MusicItem; index: number }) => (
            <MusicRow
                item={item}
                position={index + 1}
                onPress={playFrom}
                onMore={openItemMenu}
            />
        ),
        [playFrom, openItemMenu],
    );

    // header 不经行容器，平板要自己对齐到与行同一内容列
    // 分栏时行走的是 paneRowStyleFor（840 封顶 + 内容线另加），header 得用同一份，
    // 否则右区够宽时工具条与歌曲行的外缘每侧差 32dp
    const header = inPane ? (
        <View style={paneRowStyle}>
            <PlayAllBar
                musicList={musicList}
                onSort={pickSort}
                onMultiSelect={openMultiSelect}
            />
        </View>
    ) : (
        <ContentColumn kind="list">
            <PlayAllBar
                musicList={musicList}
                onSort={pickSort}
                onMultiSelect={openMultiSelect}
            />
        </ContentColumn>
    );

    return (
        <MediaList
            locateCurrent
            locateKey={currentKey}
            inPane={inPane}
            data={musicList}
            renderItem={renderItem}
            keyExtractor={mediaKey}
            ListHeaderComponent={header}
            maintainVisibleContentPosition={false}
            contentContainerStyle={listContentStyle}
            empty={{
                icon: 'inbox',
                title: t('localMusic.empty.title'),
                description: t('localMusic.empty.description'),
            }}
        />
    );
}
