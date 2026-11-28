import { StyleSheet, View } from 'react-native';

import { Box } from '@/components/ui/Box';
import { IconButton } from '@/components/ui/IconButton';
import { ListItem } from '@/components/ui/ListItem';
import { MediaCover } from '@/components/ui/MediaCover';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Text } from '@/components/ui/Text';
import {
    download,
    useDownloadPendingPhase,
    useDownloadProgress,
} from '@/core/download';
import { space } from '@/design';
import { useT } from '@/i18n';
import { formatFileSize } from '@/utils/number';

import type { ActiveDownloadRecord } from '@/core/download';

/** 封面边长（dp）：设计稿为下载行专门定的方形封面，比媒体行的缩略图略大 */
const COVER_SIZE = 48;

interface DownloadTaskRowProps {
    record: ActiveDownloadRecord;
}

/**
 * 下载任务行：封面 + 标题/歌手 + 状态或进度 + 尾部动作
 *
 * 不复用 `MusicRow`：那是「点整行即播放」的媒体行，而任务行点整行没有含义，
 * 且要多出进度轨与两个专属动作（设计稿 §1.3 明确区分了两者）
 */
export function DownloadTaskRow({ record }: DownloadTaskRowProps) {
    const t = useT();
    const progress = useDownloadProgress(record.mediaKey);
    // 库里同为 pending 的任务处境很不一样：有的已占槽在解析音源，有的在等闸门或间隔
    const pendingPhase = useDownloadPendingPhase(record.mediaKey, record.state);
    const { item } = record;
    // 命令只认媒体身份，不需要整个 DTO，因而也不必把只读快照强转回可变
    const ref = { platform: item.platform, id: item.id };

    const artistText =
        typeof item.artist === 'string' ? item.artist.trim() : '';
    const artist = artistText || t('media.unknownArtist');
    const album = typeof item.album === 'string' ? item.album : undefined;
    const subtitle = [artist, album].filter(Boolean).join(' - ');

    const status = statusTextOf();
    const ratio = ratioOf();

    /** 状态行：正在传输时报进度，其余各态报自己的状态词 */
    function statusTextOf(): string {
        switch (record.state) {
            case 'downloading':
                return progressTextOf();
            case 'paused':
                return t('downloadManager.status.paused');
            case 'failed':
                // 旧记录没有 failure 字段，落到 unknown（措辞即通用的「下载失败」）
                return t(
                    `downloadManager.failure.${record.failure ?? 'unknown'}`,
                );
            case 'pending':
                // 阶段只对 pending 有意义；取不到就按最普通的排队处置。
                // 不写 default：将来给阶段加成员时，这里漏处理会被类型检查逮住
                switch (pendingPhase ?? 'queued') {
                    case 'resolvingSource':
                        return t('downloadManager.status.resolvingSource');
                    case 'waitingWifi':
                        return t('downloadManager.status.waitingWifi');
                    case 'waitingInterval':
                        return t('downloadManager.status.waitingInterval');
                    case 'queued':
                        return t('downloadManager.status.queued');
                }
        }
    }

    function progressTextOf(): string {
        const downloaded = formatFileSize(progress?.downloadedBytes ?? 0);
        // 服务端没给 Content-Length 时总量为 -1：不编百分比，只报已下多少
        if (!progress || progress.totalBytes <= 0) {
            return t('downloadManager.progress.unknownTotal', { downloaded });
        }
        return t('downloadManager.progress.determinate', {
            percent: Math.floor(
                (progress.downloadedBytes / progress.totalBytes) * 100,
            ),
            downloaded,
            total: formatFileSize(progress.totalBytes),
        });
    }

    /** 进度比例；`undefined` 交给轨道走不确定态 */
    function ratioOf(): number | undefined {
        if (record.state !== 'downloading') return undefined;
        if (!progress || progress.totalBytes <= 0) return undefined;
        return progress.downloadedBytes / progress.totalBytes;
    }

    // 只有真在传输时才摆轨道：暂停后 core 会清掉进度快照，再给轨道它只能跑不确定动画
    // 并向读屏报 busy，与「已暂停」直接矛盾；排队与失败更无进度可言
    const showTrack = record.state === 'downloading';

    return (
        <ListItem
            leading={
                <MediaCover
                    source={
                        typeof item.artwork === 'string'
                            ? item.artwork
                            : undefined
                    }
                    size={COVER_SIZE}
                    fallbackIcon="disc-3"
                />
            }
            title={
                <Text size="md" numberOfLines={1}>
                    {item.title}
                </Text>
            }
            subtitle={
                <View style={styles.detail}>
                    <Text size="sm" color="textSecondary" numberOfLines={1}>
                        {subtitle}
                    </Text>
                    <Text size="sm" color="textSecondary" numberOfLines={1}>
                        {status}
                    </Text>
                    {pendingPhase === 'waitingWifi' ? (
                        <Text size="sm" color="textSecondary" numberOfLines={1}>
                            {t('downloadManager.status.waitingWifiHint')}
                        </Text>
                    ) : null}
                    {showTrack ? (
                        <ProgressBar
                            value={ratio}
                            accessibilityLabel={t(
                                'downloadManager.a11y.progress',
                                {
                                    title: item.title,
                                    status,
                                },
                            )}
                        />
                    ) : null}
                </View>
            }
            trailing={
                <Box gap="xs">
                    <PrimaryAction record={record} />
                    <IconButton
                        icon="x"
                        size="sm"
                        tone="textSecondary"
                        onPress={() => download.cancel(ref)}
                        accessibilityLabel={t(
                            record.state === 'failed'
                                ? 'downloadManager.a11y.remove'
                                : 'downloadManager.a11y.cancel',
                            { title: item.title },
                        )}
                    />
                </Box>
            }
        />
    );
}

/**
 * 尾部主动作：随状态在暂停 / 继续 / 重试之间切换；排队与等待 Wi-Fi 没有主动作
 * 无障碍名带上歌名：一屏十几行都叫「暂停下载」的话读屏用户分不出在操作哪一首
 */
function PrimaryAction({ record }: { record: ActiveDownloadRecord }) {
    const t = useT();
    const { item } = record;
    const ref = { platform: item.platform, id: item.id };
    const title = item.title;
    switch (record.state) {
        case 'downloading':
            return (
                <IconButton
                    icon="pause"
                    onPress={() => download.pause(ref)}
                    accessibilityLabel={t('downloadManager.a11y.pause', {
                        title,
                    })}
                />
            );
        case 'paused':
            return (
                <IconButton
                    icon="play"
                    onPress={() => download.resume(ref)}
                    accessibilityLabel={t('downloadManager.a11y.resume', {
                        title,
                    })}
                />
            );
        case 'failed':
            return (
                <IconButton
                    icon="refresh-cw"
                    onPress={() => download.retry(ref)}
                    accessibilityLabel={t('downloadManager.a11y.retry', {
                        title,
                    })}
                />
            );
        // 排队中（含等待 Wi-Fi）没什么可暂停或重试的，只留取消
        case 'pending':
            return null;
    }
}

const styles = StyleSheet.create({
    detail: {
        gap: space.xs,
    },
});
