import { useRoute, type RouteProp } from '@react-navigation/native';
import {
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { Input } from '@/components/ui/Input';
import { MediaList } from '@/components/ui/MediaList';
import { player } from '@/core/player';
import { useBackAction } from '@/hooks/useBackAction';
import { useT } from '@/i18n';
import { claim } from '@/infra/stash';
import { mediaKey } from '@/utils/media';
import { MusicBar } from '@/widgets/MusicBar';
import { MusicRow } from '@/widgets/MusicRow';
import { showMusicItemOptionsPanel } from '@/widgets/overlays/MusicItemOptionsPanel';

import { useScreenEntered } from './hooks/useScreenEntered';
import {
    buildSearchIndex,
    filterMusicList,
    type SearchIndexEntry,
} from './lib/filter';

import type { MusicItem } from '@/types';
import type { MusicItemOptionsSource } from '@/widgets/overlays/MusicItemOptionsPanel';

/** 集合内搜索路由参数：仅 stash 取件号（列表快照含插件私有字段、不可靠序列化，故走 stash） */
export type SearchInListParams = { ticket: string };

/** stash 载荷：搜索所需的一次性上下文；唤起方 stash 一个同形对象、本页 claim 取回 */
interface SearchInListPayload {
    /** 被搜索的完整列表快照 */
    musicList: readonly MusicItem[];
    /** 单曲「更多」面板的来源上下文 */
    itemOptionsSource: MusicItemOptionsSource;
    /** 集合标题，用于占位文案 */
    title?: string;
}

const EMPTY: readonly MusicItem[] = [];

/**
 * 集合内歌曲搜索页：在唤起方传入的完整列表内本地过滤（多词 AND + 拼音）
 * 点结果按原完整列表定位播放（非筛选子集）；列表为快照，搜索期间不反映源侧增删
 */
export default function SearchInListScreen() {
    const t = useT();
    const back = useBackAction();
    // 列表挂载让位给进场转场：转场结束前不挂 MediaList，避免首屏行渲染把转场堵在后面
    const entered = useScreenEntered();
    const route =
        useRoute<
            RouteProp<{ SearchInList: SearchInListParams }, 'SearchInList'>
        >();
    const { ticket } = route.params;

    // claim 破坏性（读即删）：放提交后的 effect 做、渲染期保持纯净；键 ticket 支持同屏换参重取
    const [claimed, setClaimed] = useState<{
        ticket: string;
        payload: SearchInListPayload | undefined;
    }>();
    useEffect(() => {
        setClaimed({ ticket, payload: claim<SearchInListPayload>(ticket) });
    }, [ticket]);
    const matched = claimed?.ticket === ticket ? claimed : undefined;
    const musicList = matched?.payload?.musicList ?? EMPTY;
    const itemOptionsSource = matched?.payload?.itemOptionsSource;
    const title = matched?.payload?.title;

    const [query, setQuery] = useState('');
    // 过滤跑在 deferred query 上，输入框保持即时响应
    const deferredQuery = useDeferredValue(query);
    // 拼音索引懒建：空查询直接用原列表（不付拼音成本），首个非空查询才建、按列表身份缓存复用
    const indexRef = useRef<{
        list: readonly MusicItem[];
        index: SearchIndexEntry[];
    } | null>(null);
    const results = useMemo<readonly MusicItem[]>(() => {
        if (!deferredQuery.trim()) {
            return musicList;
        }
        if (indexRef.current?.list !== musicList) {
            indexRef.current = {
                list: musicList,
                index: buildSearchIndex(musicList),
            };
        }
        return filterMusicList(indexRef.current.index, deferredQuery);
    }, [musicList, deferredQuery]);

    // 点结果：换成整份原列表并定位到该曲（非筛选子集）；fire-and-forget，错误由 core/player 恢复
    const playFrom = useCallback(
        (item: MusicItem) => {
            player.replaceQueueAndPlay(item, [...musicList]).catch(() => {});
        },
        [musicList],
    );
    const openItemMenu = useCallback(
        (item: MusicItem) => {
            if (itemOptionsSource) {
                showMusicItemOptionsPanel({ item, source: itemOptionsSource });
            }
        },
        [itemOptionsSource],
    );
    const renderItem = useCallback(
        ({ item }: { item: MusicItem }) => (
            <MusicRow item={item} onPress={playFrom} onMore={openItemMenu} />
        ),
        [playFrom, openItemMenu],
    );

    return (
        <Screen edges={['bottom']}>
            <AppBar
                leading={back}
                contentWidth="list"
                center={
                    <Input
                        value={query}
                        onChangeText={setQuery}
                        size="md"
                        leadingIcon="search"
                        clearable
                        autoFocus
                        returnKeyType="search"
                        onSubmitEditing={Keyboard.dismiss}
                        placeholder={
                            title
                                ? t('searchInList.promptNamed', { name: title })
                                : t('searchInList.prompt')
                        }
                        accessibilityLabel={t('searchInList.a11y.searchField')}
                    />
                }
            />
            <PaperPane width="list">
                <View style={styles.content}>
                    {entered ? (
                        <MediaList
                            data={results}
                            renderItem={renderItem}
                            keyExtractor={mediaKey}
                            isLoading={!matched}
                            maintainVisibleContentPosition={false}
                            keyboardShouldPersistTaps="handled"
                            empty={{
                                icon: 'search',
                                title: t('searchInList.noResults'),
                            }}
                        />
                    ) : null}
                </View>
            </PaperPane>
            <MusicBar />
        </Screen>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
    },
});
