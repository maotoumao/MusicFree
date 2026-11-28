import { ScrollView, StyleSheet, View } from 'react-native';

import { definePanel, showToast } from '@/components/overlay';
import { LabeledIconButton } from '@/components/ui/LabeledIconButton';
import { MediaCover } from '@/components/ui/MediaCover';
import { PanelRow } from '@/components/ui/PanelRow';
import { Text } from '@/components/ui/Text';
import { download, isDownloadSupported } from '@/core/download';
import { history } from '@/core/history';
import { localMusic } from '@/core/localMusic';
import { mediaMeta } from '@/core/mediaMeta';
import { player, usePlaybackRate } from '@/core/player';
import { playlist, useIsFavorite } from '@/core/playlist';
import { usePlugin } from '@/core/plugin';
import { layout, space } from '@/design';
import { useT } from '@/i18n';
import { copyText } from '@/infra/clipboard';
import { navigationRef } from '@/infra/navigation';
import { stash } from '@/infra/stash';
import { isLocalPlatform } from '@/utils/media';
import { firstNonBlank } from '@/utils/text';
import { useRequestDownload } from '@/widgets/hooks/useRequestDownload';
import { useSleepTimerSummary } from '@/widgets/hooks/useSleepTimerSummary';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import { showAddToPlaylistPanel } from './AddToPlaylistPanel';
import { showLyricSearchPanel } from './LyricSearchPanel';
import {
    formatPlaybackRate,
    showPlaybackRatePicker,
} from './playbackRatePicker';
import { showSharePosterPanel } from './SharePosterPanel';
import { showSleepTimerPanel } from './SleepTimerPanel';

import type { OverlayProps } from '@/components/overlay';
import type { MusicItem } from '@/types';

/**
 * 单曲「更多」面板的调用来源
 * 判据：source 只决定「从某集合移除」——移除≠删歌、一歌可同时属多集合
 * 每首状态（收藏/已下载/歌词关联）不是 source、应由面板 live 读；当前仅收藏已接，余占位
 */
export type MusicItemOptionsSource =
    | { kind: 'history' }
    | { kind: 'localPlaylist'; playlistId: string }
    | { kind: 'localLibrary' }
    | { kind: 'downloaded' }
    | { kind: 'generic' };

export interface MusicItemOptionsInput {
    item: MusicItem;
    source: MusicItemOptionsSource;
    /** 显示倍速行：仅正在播放页打开时开启（均衡器占了封面栏、倍速降级到此） */
    showPlaybackRate?: boolean;
}

/**
 * 定时关闭行：尾部值在倒计时期间每秒变，单独成组件把重渲关在这一行内
 * 先收面板再开定时面板，避免两张面板叠着
 */
function SleepTimerRow({ close }: { close: () => void }) {
    const t = useT();
    const summary = useSleepTimerSummary();
    return (
        <PanelRow
            icon="clock"
            label={t('sleepTimerPanel.title')}
            value={summary}
            onPress={() => {
                close();
                showSleepTimerPanel();
            }}
        />
    );
}

function MusicItemOptionsPanelView({
    payload,
    close,
}: OverlayProps<MusicItemOptionsInput, void>) {
    const { item, source, showPlaybackRate } = payload;
    const t = useT();
    const isFavorited = useIsFavorite(item);
    const rate = usePlaybackRate();
    // 两根轴，别混：身份字段是不是本地平台 vs 设备上此刻有没有这个文件
    const isLocal = isLocalPlatform(item.platform);
    const localFile = mediaMeta.getLocalFiles({
        platform: item.platform,
        id: item.id,
    })[0];
    const hasLocalFile = localFile !== undefined;
    const plugin = usePlugin(item.platform);
    const requestDownload = useRequestDownload();
    const supportsComment =
        plugin?.supportedMethods.has('getMusicComments') ?? false;
    const copyHint = t('musicItemOptionsPanel.a11y.copyHint');
    // 插件返回的歌手/专辑可能是空串或全空白：过滤后再展示与复制，免得复制出空内容清空剪贴板
    const artist = firstNonBlank(item.artist);
    const album = firstNonBlank(item.album);
    const subtitle = [artist, album].filter(Boolean).join(' · ');
    /**
     * 下载行只有两态：已下载（只读展示）/ 未下载（可点）
     *
     * 不表达排队中、下载中这些中间态：它们转瞬即逝，进度该去下载管理页看，
     * 在单曲面板里多出两个点不动的中间态只会让这一行忐忑
     *
     * **判据是播放锚点而非下载记录**，与列表标志、正在播放页保持同一根轴——
     * 「移除下载记录」刻意保留文件与锚点，若这里改问记录，那之后这一行会说「下载」
     * 而列表里同一首歌还标着「已下载」
     *
     * 音质是全局设置、不逐首选，所以这一行永远不打开选择器；换音质走「删除 → 改设置 → 重下」
     */
    const isDownloaded = !isLocal && hasLocalFile;
    const downloadRow = isDownloaded
        ? {
              label: t('musicItemOptionsPanel.download.downloaded'),
              // 展示的是这份文件实际命中的档，不是设置里的默认档；
              // 扫描进来的文件没有音质档概念，此时只显示「已下载」
              value: localFile.quality
                  ? t(`media.quality.${localFile.quality}`)
                  : undefined,
          }
        : { label: t('common.download'), value: undefined };

    const failed = () =>
        showToast(t('feedback.operationFailed'), { type: 'error' });

    // 收藏是唯一 toggle：切换后不关闭面板，让状态翻转可见
    // 命令式读当前收藏态，避免双击时用到过期的 render 值
    const toggleFavorite = () => {
        playlist.toggleFavorite(item).catch(failed);
    };
    const addToPlaylist = () => {
        // options → picker 直接替换：先关自己、再开 picker（同一事件合批进一帧）。
        // 顺序要紧：close() 会级联关掉自己「上方」的子面板，必须在 picker 入栈前先关，
        // 否则会把刚开的 picker 一起级联关掉（就什么都不剩了）
        close();
        showAddToPlaylistPanel({ items: [item] });
    };
    // 下一首播放 = 插到当前曲之后（enqueueNext），非切歌
    const enqueueNext = () => {
        player.enqueueNext(item).catch(failed);
        close();
    };
    // 评论页：先关面板再导航（同 addToPlaylist 的替换语义）
    // MusicItem 含插件私有字段、不可靠序列化 → 存 stash 只传 ticket
    // 用 navigationRef 而非 useNavigation：本面板渲染在 OverlayHost 内，不在导航 context 中
    const viewComments = () => {
        close();
        navigationRef.navigate('MusicComments', { ticket: stash(item) });
    };
    /**
     * 指定这首歌用哪份词的两条独立路径：搜索关联 / 手工编辑
     * 都放在本面板而非只挂正在播放页——它们要能给**任意一首歌**配词，包括没在放的
     * 两者写同一个来源槽位、后写覆盖，故不互相指路
     */
    const searchLyric = () => {
        close();
        showLyricSearchPanel({ item });
    };
    const editLyric = () => {
        close();
        navigationRef.navigate('EditLyric', { ticket: stash(item) });
    };
    const addToQueue = () => {
        player.enqueue(item).catch(failed);
        close();
    };
    // 下载：按设置里的默认下载音质入队；判重与回执与正在播放页共用一处实现
    const startDownload = () => {
        requestDownload(item as MusicItem);
        close();
    };
    // 分享走海报面板：它是这条手势链上的下一张纸，exclusive 正好把上一张清掉
    const share = () => {
        showSharePosterPanel(
            {
                title: item.title,
                artist: item.artist,
                artwork: item.artwork,
            },
            { behavior: 'exclusive' },
        );
    };
    // 复制类动作与收藏一样不关面板：连续复制 id / 歌手 / 专辑不用反复重开
    const copy = async (text: string) => {
        try {
            await copyText(text);
            showToast(t('feedback.copied'), { type: 'success' });
        } catch {
            failed();
        }
    };
    const removeFromHistory = () => {
        history.remove(item);
        close();
    };
    const removeFromPlaylist = () => {
        if (source.kind === 'localPlaylist') {
            playlist
                .removeMusicFromLocalPlaylist(source.playlistId, item)
                .catch(failed);
        }
        close();
    };
    // 从本地库移除：只移出库、下次扫描会扫回、不动物理文件
    const removeFromLibrary = () => {
        localMusic.removeFromLibrary([
            { platform: item.platform, id: item.id },
        ]);
        showToast(t('musicItemOptionsPanel.removedFromLibrary'), {
            type: 'success',
        });
        close();
    };
    /**
     * 移除下载记录：只把这一条移出下载库，**不删文件、不动本地库、不动播放锚点**
     *
     * 不过确认：它是纯粹的集合成员资格操作，与「从歌单移除」同构，且文件还在、随时可重下。
     * 确认强度要与不可逆性成正比——真正不可逆的是下面的「删除文件」
     */
    const forgetDownload = () => {
        download.forgetDownload({ platform: item.platform, id: item.id });
        showToast(t('musicItemOptionsPanel.forgotDownload'), {
            type: 'success',
        });
        close();
    };
    // 删除文件：物理删除设备文件（不可撤销）；先关面板→确认→请求写权限→删→本地歌才移出队列
    const deleteFile = async () => {
        close();
        const ok = await showConfirmDialog({
            title: t('musicItemOptionsPanel.deleteFileConfirm.title'),
            message: t('musicItemOptionsPanel.deleteFileConfirm.message', {
                title: item.title,
            }),
            confirmText: t('musicItemOptionsPanel.actions.deleteFile'),
            danger: true,
        });
        if (!ok) {
            return;
        }
        const ref = { platform: item.platform, id: item.id };
        try {
            // 删原文件需写权限：≤10 请求 WRITE（同 READ 组通常静默 granted）；R+ 复用全文件访问
            const perm = await localMusic.requestFileWriteAccess();
            if (perm !== 'granted') {
                if (perm === 'blocked') {
                    const go = await showConfirmDialog({
                        title: t('musicItemOptionsPanel.writePermission.title'),
                        message: t(
                            'musicItemOptionsPanel.writePermission.message',
                        ),
                        confirmText: t(
                            'musicItemOptionsPanel.writePermission.openSettings',
                        ),
                    });
                    if (go) {
                        await localMusic
                            .openPermissionSettings()
                            .catch(() => {});
                    }
                } else {
                    showToast(
                        t('musicItemOptionsPanel.writePermission.denied'),
                        { type: 'info' },
                    );
                }
                return;
            }
            // 删哪一份文件取决于用户是从哪个集合点进来的：
            // 下载页「已完成」那一行代表的是**下载记录里的那个文件**；而按 ref 让本地库反查
            // 给的是「代表文件」（同身份多副本里体积最大那份）——用户若把下载好的文件复制过
            // 别处，两者就不是同一个，照 ref 删会删掉他自己那份副本
            const downloadedPath =
                source.kind === 'downloaded'
                    ? download.getDownloaded(ref)?.file.path
                    : undefined;
            const report = downloadedPath
                ? await localMusic.deleteFilesAt([downloadedPath])
                : await localMusic.deleteFiles([ref]);
            if (report.deleted > 0) {
                showToast(t('musicItemOptionsPanel.fileDeleted'), {
                    type: 'success',
                });
                // 只有本地歌才移出队列：文件即歌曲本体，删了这首歌就不存在了。
                // 插件歌的下载副本删掉后歌还在（锚点已清，播放侧会重解析、尝试回退远程源），
                // 移出队列会误跳下一首。队列同步 best-effort，失败不改删除结论
                if (isLocal) {
                    await player.removeFromQueue(ref).catch(() => {});
                }
            } else {
                const code = report.failures[0]?.code ?? 'unknown';
                showToast(t(`musicItemOptionsPanel.deleteFailed.${code}`), {
                    type: 'error',
                });
            }
        } catch {
            showToast(t('musicItemOptionsPanel.deleteFailed.unknown'), {
                type: 'error',
            });
        }
    };

    return (
        <View style={styles.root}>
            <View style={styles.header}>
                <MediaCover
                    source={item.artwork}
                    fallbackIcon="disc-3"
                    size={layout.mediaThumbnail}
                />
                <View style={styles.headerText}>
                    <Text
                        size="lg"
                        weight="bold"
                        lineHeight="tight"
                        numberOfLines={2}
                    >
                        {item.title}
                    </Text>
                    {subtitle ? (
                        <Text
                            size="sm"
                            color="textSecondary"
                            numberOfLines={1}
                            style={styles.headerSub}
                        >
                            {subtitle}
                        </Text>
                    ) : null}
                </View>
            </View>

            <View style={styles.quickbar}>
                <LabeledIconButton
                    icon={isFavorited ? 'heart-filled' : 'heart'}
                    tone={isFavorited ? 'primary' : 'text'}
                    // 收藏态只高亮图标，标签保持中性（与快捷条其余项一致）
                    labelTone="text"
                    label={
                        isFavorited
                            ? t('musicItemOptionsPanel.actions.favorited')
                            : t('musicItemOptionsPanel.actions.favorite')
                    }
                    accessibilityLabel={
                        isFavorited
                            ? t('musicItemOptionsPanel.a11y.unfavorite')
                            : t('musicItemOptionsPanel.actions.favorite')
                    }
                    selected={isFavorited}
                    onPress={toggleFavorite}
                />
                <LabeledIconButton
                    icon="folder-plus"
                    label={t('musicItemOptionsPanel.actions.addToPlaylist')}
                    onPress={addToPlaylist}
                />
                <LabeledIconButton
                    icon="corner-down-right"
                    label={t('musicItemOptionsPanel.actions.playNext')}
                    onPress={enqueueNext}
                />
                <LabeledIconButton
                    icon="share-2"
                    label={t('common.share')}
                    onPress={share}
                />
            </View>

            <ScrollView style={styles.body}>
                {/* 信息行：标签自带值，点按复制该值，不离开面板 */}
                <PanelRow
                    icon="puzzle"
                    label={t('musicItemOptionsPanel.info.source', {
                        value: item.platform,
                    })}
                    accessibilityHint={copyHint}
                    onPress={() => copy(item.platform)}
                />
                <PanelRow
                    icon="id-card"
                    label={t('musicItemOptionsPanel.info.id', {
                        value: item.id,
                    })}
                    accessibilityHint={copyHint}
                    onPress={() => copy(item.id)}
                />
                {artist ? (
                    <PanelRow
                        icon="user-round"
                        label={t('musicItemOptionsPanel.info.artist', {
                            value: artist,
                        })}
                        accessibilityHint={copyHint}
                        onPress={() => copy(artist)}
                    />
                ) : null}
                {album ? (
                    <PanelRow
                        icon="disc-3"
                        label={t('musicItemOptionsPanel.info.album', {
                            value: album,
                        })}
                        accessibilityHint={copyHint}
                        onPress={() => copy(album)}
                    />
                ) : null}
                {/*
                 * 下载行：已下载时是只读展示，其余一律是可点的「下载」（不表达中间态）
                 * 音质是全局设置、不逐首选，故这一行永远不打开选择器
                 * 本地来源的歌与不支持下载的平台整行隐藏——那两种不可用是恒真的，
                 * 灰着没有信息量（与「查看评论·该插件不支持」不同，后者换首歌就能用）
                 */}
                {isLocal || !isDownloadSupported ? null : (
                    <PanelRow
                        icon="cloud-download"
                        label={downloadRow.label}
                        value={downloadRow.value}
                        disabled={isDownloaded}
                        onPress={isDownloaded ? undefined : startDownload}
                    />
                )}
                {/*
                 * 播放控制收在动作列表末尾（紧邻删除组之前）：它们是全局播放态、
                 * 不属于这首歌，排在信息与单曲动作之后才不打断逐曲的扫读动线
                 */}
                {showPlaybackRate ? (
                    <PanelRow
                        icon="gauge"
                        label={t('media.playbackRate')}
                        value={formatPlaybackRate(rate)}
                        onPress={() => {
                            close();
                            showPlaybackRatePicker(rate);
                        }}
                    />
                ) : null}
                <SleepTimerRow close={close} />
                {/* 恒显示：插件不支持评论时置灰，让能力差异可见而非入口忽隐忽现 */}
                <PanelRow
                    icon="message-circle"
                    label={t('musicItemOptionsPanel.actions.viewComment')}
                    disabled={!supportsComment}
                    onPress={supportsComment ? viewComments : undefined}
                    value={
                        supportsComment
                            ? undefined
                            : t('musicItemOptionsPanel.commentUnsupported')
                    }
                />
                {/* 与评论同族：都是「这首歌的内容」，故紧邻成组，排在队列动作之前 */}
                <PanelRow
                    icon="search"
                    label={t('musicItemOptionsPanel.actions.searchLyric')}
                    onPress={searchLyric}
                />
                <PanelRow
                    icon="pencil"
                    label={t('musicItemOptionsPanel.actions.editLyric')}
                    onPress={editLyric}
                />
                <PanelRow
                    icon="list-end"
                    label={t('musicItemOptionsPanel.actions.addToQueue')}
                    onPress={addToQueue}
                />
                {source.kind === 'history' ? (
                    <PanelRow
                        icon="trash-2"
                        label={t(
                            'musicItemOptionsPanel.actions.removeFromHistory',
                        )}
                        onPress={removeFromHistory}
                        danger
                        separatorBefore
                    />
                ) : null}
                {source.kind === 'localPlaylist' ? (
                    <PanelRow
                        icon="trash-2"
                        label={t(
                            'musicItemOptionsPanel.actions.removeFromPlaylist',
                        )}
                        onPress={removeFromPlaylist}
                        danger
                        separatorBefore
                    />
                ) : null}
                {source.kind === 'localLibrary' ? (
                    <PanelRow
                        icon="circle-x"
                        label={t(
                            'musicItemOptionsPanel.actions.removeFromLibrary',
                        )}
                        onPress={removeFromLibrary}
                        danger
                        separatorBefore
                    />
                ) : null}
                {source.kind === 'downloaded' ? (
                    <PanelRow
                        icon="circle-x"
                        label={t(
                            'musicItemOptionsPanel.actions.forgetDownload',
                        )}
                        onPress={forgetDownload}
                        danger
                        separatorBefore
                    />
                ) : null}
                {hasLocalFile ? (
                    <PanelRow
                        icon="trash-2"
                        label={t('musicItemOptionsPanel.actions.deleteFile')}
                        onPress={deleteFile}
                        danger
                        separatorBefore={source.kind === 'generic'}
                    />
                ) : null}
            </ScrollView>
        </View>
    );
}

/** 单曲「更多」面板：歌曲头（纯展示）+ 无底快捷条 + 动作列表；source 决定删除动作 */
export const showMusicItemOptionsPanel = definePanel(MusicItemOptionsPanelView);

const styles = StyleSheet.create({
    root: {
        flexGrow: 1,
        flexShrink: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingBottom: space.md,
    },
    headerText: {
        flex: 1,
    },
    headerSub: {
        marginTop: space.xs,
    },
    quickbar: {
        flexDirection: 'row',
        paddingHorizontal: space.md,
    },
    body: {
        flexGrow: 1,
        flexShrink: 1,
    },
});
