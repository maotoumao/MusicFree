import { StyleSheet, View } from 'react-native';

import { Box } from '@/components/ui/Box';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { ListItem } from '@/components/ui/ListItem';
import { Tag } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { useHasLocalFile } from '@/core/mediaMeta';
import { player, useCurrentMusic } from '@/core/player';
import { space } from '@/design';
import { useT } from '@/i18n';
import { isLocalPlatform } from '@/utils/media';

import type { MusicItem } from '@/types';

interface MusicRowProps {
    item: MusicItem;
    /** 从 1 开始的行号，有固定顺序的上下文传入（历史 / 歌单）；搜索不传即无前导槽 */
    position?: number;
    /** 点按行为；缺省播放该曲，搜索页注入 clickMusicInSearch 感知的处理器 */
    onPress?: (item: MusicItem) => void;
    /** 尾部「更多」处理器；提供则渲染 ellipsis-vertical，由调用方打开条目级 ActionSheet */
    onMore?: (item: MusicItem) => void;
}

/**
 * player-aware 的单曲行：包裹 ListItem，按 useCurrentMusic 把当前曲标为 selected
 * 平台走 Tag，无封面；尾部「更多」委托 onMore，点按缺省播放该曲
 */
export function MusicRow({ item, position, onPress, onMore }: MusicRowProps) {
    const t = useT();
    const current = useCurrentMusic();
    const isCurrent =
        current?.platform === item.platform && current?.id === item.id;
    /**
     * 「已下载」标志：**非本地来源** + 设备上有文件
     *
     * 判据是条目级而非页面级——本地音乐里扫描来的歌无须标注（它们本来就是设备上的文件），
     * 而下载来的歌身份是插件，这个标志说的正是「它已经落到本机了」，在哪一页都成立
     *
     * 只表达「有 / 无」两态：排队中、下载中这些中间态转瞬即逝，扫读列表时并不关心
     *
     * 依据是播放锚点而非下载记录，故与面板里的 `isDownloaded`（记录为 done）不是同一回事：
     * 插件来源的文件若被手动拷进扫描目录并扫到，同样算「已在本机」
     */
    const hasLocalFile = useHasLocalFile({
        platform: item.platform,
        id: item.id,
    });
    const showDownloadedMark = !isLocalPlatform(item.platform) && hasLocalFile;

    // 副标题「歌手 - 专辑」；歌手缺失回退未知歌手（副标题恒有一行），专辑缺失不留多余连接符
    // 插件 DTO 不可信：非字符串字段一律当缺失，避免 trim 崩整列表
    const artistText =
        typeof item.artist === 'string' ? item.artist.trim() : '';
    const artist = artistText || t('media.unknownArtist');
    const album = typeof item.album === 'string' ? item.album : undefined;
    const subtitle = [artist, album].filter(Boolean).join(' - ');
    // 行读屏名含未截断的平台（Tag 自身 a11y 隐藏）；分隔符对齐设计走查稿
    // 已下载标志是纯图标，其含义必须进读屏名，否则这条信息对读屏用户不存在
    const a11yLabel = [
        item.title,
        subtitle,
        item.platform,
        showDownloadedMark ? t('musicRow.a11y.downloaded') : '',
    ]
        .filter(Boolean)
        .join('，');

    return (
        <ListItem
            selected={isCurrent}
            leading={
                position != null ? (
                    <View style={styles.positionSlot}>
                        {/* 隐形占位：in-flow 撑出一行高，给绝对定位的序号提供垂直基准 */}
                        <Text size="md" style={styles.positionGhost}>
                            0
                        </Text>
                        <Text
                            size="md"
                            color="textSecondary"
                            numberOfLines={1}
                            style={styles.positionValue}
                        >
                            {position}
                        </Text>
                    </View>
                ) : undefined
            }
            title={
                <Box row align="center" gap="xs">
                    <Text
                        size="md"
                        color={isCurrent ? 'onPrimarySoft' : 'text'}
                        numberOfLines={1}
                        style={styles.title}
                    >
                        {item.title}
                    </Text>
                    <View style={styles.tagSlot}>
                        <Tag label={item.platform} />
                    </View>
                </Box>
            }
            subtitle={
                subtitle ? (
                    <Box row align="center" gap="xs">
                        <Text
                            size="xs"
                            color="textSecondary"
                            numberOfLines={1}
                            style={styles.subtitleText}
                        >
                            {subtitle}
                        </Text>
                        {showDownloadedMark ? (
                            <Icon
                                name="circle-check"
                                size="xs"
                                color="success"
                            />
                        ) : null}
                    </Box>
                ) : undefined
            }
            trailing={
                onMore != null ? (
                    <IconButton
                        icon="ellipsis-vertical"
                        edgeAlign="end"
                        accessibilityLabel={t('musicRow.a11y.more', {
                            title: item.title,
                        })}
                        onPress={() => onMore(item)}
                    />
                ) : undefined
            }
            accessibilityLabel={a11yLabel}
            onPress={() => {
                if (onPress) {
                    onPress(item);
                } else {
                    // 播放失败由 player 的 onError 通道统一处理（按 autoStopWhenError 停 / 跳），行层 fire-and-forget
                    player.play(item).catch(() => {});
                }
            }}
        />
    );
}

const styles = StyleSheet.create({
    // 副标题让位给尾部的已下载标志：文字可压缩，图标不被挤出行外
    subtitleText: {
        flexShrink: 1,
    },
    // 固定 24 列占位（标题起点不随序号位数移动）
    positionSlot: {
        width: space.xl,
    },
    // 隐形占位：仅 in-flow 撑出一行高、不显示（给绝对定位的序号提供垂直基准）
    positionGhost: {
        opacity: 0,
    },
    // 序号绝对居中于 24 列：超 3 位向两侧对称溢出到 [0,56]，不撑宽/不换行/不截断，对齐 Skia 版
    positionValue: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: -space.lg,
        right: -space.lg,
        textAlign: 'center',
    },
    title: {
        flex: 1,
        minWidth: 0,
    },
    tagSlot: {
        maxWidth: '33%',
        flexShrink: 1,
    },
});
