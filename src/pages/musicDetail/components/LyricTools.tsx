/**
 * 歌词模式工具行：时间偏移、字体大小、搜索歌词、翻译、桌面歌词（Android）、更多
 * 「翻译」写持久化配置 lyric.showTranslation，歌词画布与悬浮歌词共读同一真相
 * 桌面歌词点按开关（含权限引导）、长按开设置；更多展开溢出菜单（复制歌词、编辑歌词、恢复默认歌词、桌面歌词设置）
 */
import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { config, useConfig } from '@/core/config';
import { useLyric } from '@/core/lyric';
import { useCurrentMusic } from '@/core/player';
import { layout, space } from '@/design';
import { useT } from '@/i18n';
import { os } from '@/infra/device';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showLyricFontSizePanel } from '@/widgets/overlays/LyricFontSizePanel';
import { showLyricOffsetPanel } from '@/widgets/overlays/LyricOffsetPanel';
import { showLyricSearchPanel } from '@/widgets/overlays/LyricSearchPanel';

import { useFloatingLyricToggle } from '../hooks/useFloatingLyricToggle';
import { useLyricMoreItems } from '../hooks/useLyricMoreItems';

import { ToolButton } from './ToolButton';

export const LyricTools = memo(function LyricToolsBase() {
    const t = useT();
    const { hasTranslation, timed } = useLyric();
    const showTranslation = useConfig('lyric.showTranslation') ?? false;
    const {
        enabled: floatingLyricEnabled,
        toggle: toggleFloatingLyric,
        openSettings: openFloatingLyricSettings,
    } = useFloatingLyricToggle();
    const currentMusic = useCurrentMusic();
    const openSearchLyric = useCallback(() => {
        if (currentMusic) {
            showLyricSearchPanel({ item: currentMusic });
        }
    }, [currentMusic]);
    // 溢出菜单的四项与短窗口的溢出菜单共用一份（见 hooks/useLyricMoreItems）
    const moreItems = useLyricMoreItems();
    const openMore = useCallback(() => {
        showActionSheetPanel({ items: moreItems });
    }, [moreItems]);
    const openOffset = useCallback(() => {
        showLyricOffsetPanel();
    }, []);
    const openFontSize = useCallback(() => {
        showLyricFontSizePanel();
    }, []);
    const toggleTranslation = useCallback(() => {
        config.set('lyric.showTranslation', !showTranslation);
    }, [showTranslation]);
    return (
        <View style={styles.row}>
            <ToolButton
                icon="clock"
                label={t('musicDetail.lyricTools.offset')}
                accessibilityLabel={t('musicDetail.lyricTools.offset')}
                disabled={!timed}
                onPress={openOffset}
            />
            <ToolButton
                icon="a-large-small"
                label={t('musicDetail.lyricTools.fontSize')}
                accessibilityLabel={t('musicDetail.lyricTools.fontSize')}
                onPress={openFontSize}
            />
            <ToolButton
                icon="search"
                label={t('musicDetail.searchLyric')}
                accessibilityLabel={t('musicDetail.searchLyric')}
                onPress={openSearchLyric}
            />
            <ToolButton
                icon="languages"
                label={t('musicDetail.lyricTools.translate')}
                accent={showTranslation}
                selected={showTranslation}
                disabled={!hasTranslation}
                accessibilityLabel={t('musicDetail.lyricTools.translate')}
                onPress={toggleTranslation}
            />
            {os === 'android' ? (
                <ToolButton
                    icon="captions"
                    label={t('musicDetail.lyricTools.floatingLyric')}
                    accent={floatingLyricEnabled}
                    selected={floatingLyricEnabled}
                    accessibilityLabel={t(
                        'musicDetail.lyricTools.floatingLyric',
                    )}
                    onPress={toggleFloatingLyric}
                    onLongPress={openFloatingLyricSettings}
                />
            ) : null}
            <ToolButton
                icon="ellipsis-vertical"
                label={t('common.more')}
                accessibilityLabel={t('common.more')}
                onPress={openMore}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        marginHorizontal: -layout.screenGutter,
        paddingVertical: space.sm,
    },
});
