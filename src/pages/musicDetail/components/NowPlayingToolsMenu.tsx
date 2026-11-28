/**
 * 短窗口（手机横屏 / 分屏）的工具入口：顶栏右侧的「收藏 + 更多」两键
 *
 * 竖屏那两条工具行（封面 6 项 + 歌词 6 项）在矮窗口里要占 120dp，而那正是封面与歌词
 * 唯一能长大的空间。故短窗口只留最高频的收藏，其余全进一张 action sheet——
 * 面板本体全是既有的（音质 / 倍速 / 均衡器 / 歌词偏移 / 字号 / 搜索 / 桌面歌词 / 单曲更多），
 * 判据也与竖屏共用（歌曲侧 useNowPlayingSongTools、歌词侧 useLyricMoreItems）：
 * 这里只负责把它们排成一列，不复制任何业务逻辑，也不许比竖屏少给动作
 */
import { useNavigation } from '@react-navigation/native';
import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';
import { config, useConfig } from '@/core/config';
import { useLyric } from '@/core/lyric';
import { player } from '@/core/player';
import { space } from '@/design';
import { useT } from '@/i18n';
import { os } from '@/infra/device';
import { stash } from '@/infra/stash';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showEqualizerPanel } from '@/widgets/overlays/EqualizerPanel';
import { showLyricFontSizePanel } from '@/widgets/overlays/LyricFontSizePanel';
import { showLyricOffsetPanel } from '@/widgets/overlays/LyricOffsetPanel';
import { showLyricSearchPanel } from '@/widgets/overlays/LyricSearchPanel';
import { showMusicItemOptionsPanel } from '@/widgets/overlays/MusicItemOptionsPanel';
import {
    formatPlaybackRate,
    showPlaybackRatePicker,
} from '@/widgets/overlays/playbackRatePicker';
import { showQualityPicker } from '@/widgets/overlays/qualityPicker';

import { useFloatingLyricToggle } from '../hooks/useFloatingLyricToggle';
import { useLyricMoreItems } from '../hooks/useLyricMoreItems';
import { useNowPlayingSongTools } from '../hooks/useNowPlayingSongTools';
import { PLAYER_TOOLS_MENU_WIDTH } from '../lib/layout';

import type { ActionSheetItem } from '@/widgets/overlays/ActionSheetPanel';

/**
 * 顶栏右侧那两键恒定，元素提到模块级共用：渲染里不造新 element，
 * NowPlayingNav 的 memo 才生效（翻页版与分栏版都用这一个）
 */
export const NOW_PLAYING_TOOLS_MENU = <NowPlayingToolsMenuElement />;

function NowPlayingToolsMenuElement() {
    return <NowPlayingToolsMenu />;
}

export const NowPlayingToolsMenu = memo(function NowPlayingToolsMenuBase() {
    const t = useT();
    const navigation = useNavigation();
    // 歌曲侧判据与竖屏封面工具行共用一份（见 hooks/useNowPlayingSongTools）
    const {
        currentMusic,
        isFavorited,
        toggleFavorite,
        quality,
        rate,
        eqAvailable,
        isLocal,
        downloaded,
        canDownload,
        requestDownload,
        supportsComment,
    } = useNowPlayingSongTools();
    const { hasTranslation, timed } = useLyric();
    const showTranslation = useConfig('lyric.showTranslation') ?? false;
    const { enabled: floatingLyricEnabled, toggle: toggleFloatingLyric } =
        useFloatingLyricToggle();
    // 歌词工具行的溢出动作（复制 / 编辑 / 恢复默认 / 桌面歌词设置）与竖屏同一份
    const lyricMoreItems = useLyricMoreItems();

    /**
     * 一张表列完：先歌曲侧（音质 / 倍速或均衡器 / 下载 / 评论），再歌词侧，末尾「更多」转既有单曲面板
     * 不可用的项置灰而非隐藏——与竖屏工具行同一口径，让能力差异可见
     */
    const openMenu = useCallback(() => {
        const items: ActionSheetItem[] = [
            // 当前值走 value 而非并进标签：竖屏工具行是「用值当标签」，那里只有一格宽；
            // 这里是「标签 + 行尾值」，读屏也经 accessibilityValue 报出来，不必点进 picker 才知道
            {
                icon: 'audio-lines',
                label: t('musicDetail.quality'),
                value: t(`media.quality.${quality}`),
                disabled: isLocal,
                onPress: () => showQualityPicker(quality),
            },
            eqAvailable
                ? {
                      icon: 'sliders-vertical',
                      label: t('equalizerPanel.title'),
                      onPress: () => showEqualizerPanel(),
                  }
                : {
                      icon: 'gauge',
                      label: t('media.playbackRate'),
                      value: formatPlaybackRate(rate),
                      onPress: () => showPlaybackRatePicker(rate),
                  },
            /*
             * 作用对象在按下那一刻现取（player.getCurrentMusic）而不是用闭包里的快照：
             * 菜单开着时自动切歌，快照会让「下载 / 评论 / 搜索歌词」落到上一首上。
             * 竖屏那几个是原地按钮、随切歌重渲，本来就恒指当前曲——此处对齐它。
             * 置灰判据仍是打开那刻的快照：动作因此不会落到**上一首**，但可能落到
             * 判据本会禁掉的当前曲（切到本地源后点「下载」）——那时下游会自行拒绝
             * 并给回执，比作用错对象轻
             */
            {
                icon: downloaded ? 'circle-check' : 'cloud-download',
                label: downloaded
                    ? t('musicDetail.tools.downloaded')
                    : t('common.download'),
                disabled: !canDownload,
                onPress: () => {
                    const live = player.getCurrentMusic();
                    if (live) {
                        requestDownload(live);
                    }
                },
            },
            {
                icon: 'message-circle',
                label: t('musicDetail.tools.comment'),
                disabled: !supportsComment,
                onPress: () => {
                    const live = player.getCurrentMusic();
                    if (live) {
                        // MusicItem 含插件私有字段、不可靠序列化 → 存 stash 只传 ticket
                        navigation.navigate('MusicComments', {
                            ticket: stash(live),
                        });
                    }
                },
            },
            {
                separatorBefore: true,
                icon: 'clock',
                label: t('musicDetail.lyricTools.offset'),
                disabled: !timed,
                onPress: () => showLyricOffsetPanel(),
            },
            {
                icon: 'a-large-small',
                label: t('musicDetail.lyricTools.fontSize'),
                onPress: () => showLyricFontSizePanel(),
            },
            {
                icon: 'search',
                label: t('musicDetail.searchLyric'),
                disabled: currentMusic == null,
                onPress: () => {
                    const live = player.getCurrentMusic();
                    if (live) {
                        showLyricSearchPanel({ item: live });
                    }
                },
            },
            {
                icon: 'languages',
                label: t('musicDetail.lyricTools.translate'),
                // toggle：开关行要让读屏在关态也报「未选中」，与竖屏 ToolButton 同口径
                toggle: true,
                selected: showTranslation,
                disabled: !hasTranslation,
                // 按下那刻现读：面板开着时别处改了这项，翻转不该写回过期值
                // （桌面歌词那行经 hook 也是按下时重读，两行同口径）
                onPress: () =>
                    config.set(
                        'lyric.showTranslation',
                        !(config.get('lyric.showTranslation') ?? false),
                    ),
            },
        ];
        if (os === 'android') {
            items.push({
                icon: 'captions',
                label: t('musicDetail.lyricTools.floatingLyric'),
                toggle: true,
                selected: floatingLyricEnabled,
                onPress: toggleFloatingLyric,
            });
        }
        // 竖屏这几项藏在歌词工具行的「更多」里；短窗口整条工具行让位，只能在此摊平
        items.push(...lyricMoreItems);
        items.push({
            separatorBefore: true,
            icon: 'ellipsis-vertical',
            label: t('common.more'),
            disabled: currentMusic == null,
            onPress: () => {
                const live = player.getCurrentMusic();
                if (live) {
                    showMusicItemOptionsPanel({
                        item: live,
                        source: { kind: 'generic' },
                        showPlaybackRate: eqAvailable,
                    });
                }
            },
        });
        showActionSheetPanel({ items });
    }, [
        t,
        quality,
        isLocal,
        eqAvailable,
        rate,
        downloaded,
        canDownload,
        currentMusic,
        requestDownload,
        supportsComment,
        navigation,
        timed,
        hasTranslation,
        showTranslation,
        floatingLyricEnabled,
        toggleFloatingLyric,
        lyricMoreItems,
    ]);

    return (
        <View style={styles.row}>
            {/* checked 才有 toggle 语义：读屏据此报「已选中」，与竖屏工具行口径一致 */}
            <IconButton
                icon={isFavorited ? 'heart-filled' : 'heart'}
                tone={isFavorited ? 'coverAccent' : 'coverText'}
                checked={isFavorited}
                accessibilityLabel={t('musicDetail.tools.favorite')}
                onPress={toggleFavorite}
            />
            {/* 不加 edgeAlign：顶栏容器已按贴边图标收过内距，两处补偿会叠成 8dp 越界 */}
            <IconButton
                icon="ellipsis-vertical"
                tone="coverText"
                accessibilityLabel={t('common.more')}
                onPress={openMenu}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    // 外宽钉死在 lib/layout 的 PLAYER_TOOLS_MENU_WIDTH：顶栏拿那个数算首部占位，
    // 靠注释约定会漂（再加一个键就静默失配），故直接写成宽度
    row: {
        width: PLAYER_TOOLS_MENU_WIDTH,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: space.xs,
    },
});
