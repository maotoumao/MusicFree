import { useCallback, useMemo } from 'react';

import { ContentColumn } from '@/components/layout/ContentColumn';
import { MediaList } from '@/components/ui/MediaList';
import { useDownloadedList } from '@/core/download';
import { useT } from '@/i18n';
import { useCurrentMusicKey } from '@/widgets/hooks/useCurrentMusicKey';
import { MusicRow } from '@/widgets/MusicRow';
import { showMusicItemOptionsPanel } from '@/widgets/overlays/MusicItemOptionsPanel';
import { PlayAllBar } from '@/widgets/PlayAllBar';

import type { DownloadedEntry } from '@/core/download';
import type { MusicItem } from '@/types';
import type { StyleProp, ViewStyle } from 'react-native';

interface CompletedDownloadPaneProps {
    contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * 「已完成」面：数据来自本地音乐库的下载来源视图
 *
 * 完成即毕业出队列，故与活动队列不是同一个数据源；这里只列本机下载的，
 * 扫描导入的下载来源文件仍在本地音乐里，不进本页（删除不越界）
 *
 * 单独一个组件而非在页面里分支：列表本身只在被显示时才该订阅并排序整张下载库
 */
export function CompletedDownloadPane({
    contentContainerStyle,
}: CompletedDownloadPaneProps) {
    const currentKey = useCurrentMusicKey();
    const t = useT();
    const completed = useDownloadedList();
    // PlayAllBar 要的是曲目本身；条目的其余字段（文件路径等）与播放无关
    const musicList = useMemo(
        () => completed.map(entry => entry.item as MusicItem),
        [completed],
    );

    // 已完成行是一首能听的歌而非一个传输任务，故走统一的单曲面板（设计 §8.2）：
    // 既然采用了 MusicRow 的点击语义，就没有理由不采用它的菜单语义
    const openMoreMenu = useCallback((music: MusicItem) => {
        showMusicItemOptionsPanel({
            item: music,
            source: { kind: 'downloaded' },
        });
    }, []);

    // 稳定引用：MediaList 把它透给 FlashList，而 ViewHolder 的 memo 比较 renderItem——
    // 内联箭头函数会让本组件每次重渲染（如切歌）都白扔一次全行 memo 比较
    const renderRow = useCallback(
        ({ item }: { item: DownloadedEntry }) => (
            // 设计稿：完成行回归「点整行即播放」，与任务行的专属动作相反
            <MusicRow item={item.item as MusicItem} onMore={openMoreMenu} />
        ),
        [openMoreMenu],
    );

    return (
        <MediaList
            locateCurrent
            locateKey={currentKey}
            data={completed}
            keyExtractor={keyOf}
            renderItem={renderRow}
            empty={{
                icon: 'download',
                title: t('downloadManager.empty.completed'),
            }}
            // 不给排序：固定按下载完成时间倒序，那是这个集合唯一有意义的顺序
            // 空列表时不渲染——一个「播放全部 0 首」既点不动也没有信息
            ListHeaderComponent={
                musicList.length > 0 ? (
                    // header 不经行容器，平板要自己对齐到与行同一内容列
                    <ContentColumn kind="list">
                        <PlayAllBar musicList={musicList} />
                    </ContentColumn>
                ) : null
            }
            contentContainerStyle={contentContainerStyle}
        />
    );
}

const keyOf = (entry: DownloadedEntry) => entry.mediaKey;
