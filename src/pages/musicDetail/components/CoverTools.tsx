import { useNavigation } from '@react-navigation/native';
import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { layout, space } from '@/design';
import { useT } from '@/i18n';
import { stash } from '@/infra/stash';
import { showEqualizerPanel } from '@/widgets/overlays/EqualizerPanel';
import { showMusicItemOptionsPanel } from '@/widgets/overlays/MusicItemOptionsPanel';
import {
    formatPlaybackRate,
    showPlaybackRatePicker,
} from '@/widgets/overlays/playbackRatePicker';
import { showQualityPicker } from '@/widgets/overlays/qualityPicker';

import { useNowPlayingSongTools } from '../hooks/useNowPlayingSongTools';

import { ToolButton } from './ToolButton';

export const CoverTools = memo(function CoverToolsBase() {
    const t = useT();
    const navigation = useNavigation();
    // 判据与短窗口的溢出菜单共用一份（见 hooks/useNowPlayingSongTools）
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

    const startDownload = useCallback(() => {
        if (currentMusic) {
            requestDownload(currentMusic);
        }
    }, [currentMusic, requestDownload]);

    // 评论页：MusicItem 含插件私有字段、不可靠序列化 → 存 stash 只传 ticket
    const viewComments = useCallback(() => {
        if (!currentMusic) {
            return;
        }
        navigation.navigate('MusicComments', { ticket: stash(currentMusic) });
    }, [currentMusic, navigation]);

    // 均衡器可用时倍速被收进「更多」（showPlaybackRate），仅正在播放页这一处显示
    const openMore = useCallback(() => {
        if (!currentMusic) {
            return;
        }
        showMusicItemOptionsPanel({
            item: currentMusic,
            source: { kind: 'generic' },
            showPlaybackRate: eqAvailable,
        });
    }, [currentMusic, eqAvailable]);

    const openQualityPicker = useCallback(
        () => showQualityPicker(quality),
        [quality],
    );

    const qualityLabel = t(`media.quality.${quality}`);
    const rateLabel = formatPlaybackRate(rate);

    return (
        <View style={styles.row}>
            <ToolButton
                icon={isFavorited ? 'heart-filled' : 'heart'}
                label={t('musicDetail.tools.favorite')}
                accent={isFavorited}
                selected={isFavorited}
                accessibilityLabel={t('musicDetail.tools.favorite')}
                onPress={toggleFavorite}
            />
            <ToolButton
                icon={downloaded ? 'circle-check' : 'cloud-download'}
                label={
                    downloaded
                        ? t('musicDetail.tools.downloaded')
                        : t('common.download')
                }
                disabled={!canDownload}
                accessibilityLabel={
                    downloaded
                        ? t('musicDetail.tools.downloaded')
                        : t('common.download')
                }
                onPress={startDownload}
            />
            <ToolButton
                icon="message-circle"
                label={t('musicDetail.tools.comment')}
                accessibilityLabel={t('musicDetail.tools.comment')}
                disabled={!supportsComment}
                onPress={viewComments}
            />
            <ToolButton
                icon="audio-lines"
                label={qualityLabel}
                accent={quality !== 'standard'}
                // 本地来源的歌直接放盘上那份文件，没有音质档可选
                disabled={isLocal}
                accessibilityLabel={t('musicDetail.a11y.quality', {
                    value: qualityLabel,
                })}
                onPress={openQualityPicker}
            />
            {eqAvailable ? (
                <ToolButton
                    icon="sliders-vertical"
                    label={t('equalizerPanel.title')}
                    accessibilityLabel={t('equalizerPanel.title')}
                    onPress={() => showEqualizerPanel()}
                />
            ) : (
                <ToolButton
                    icon="gauge"
                    label={rateLabel}
                    accent={rate !== 1}
                    accessibilityLabel={t('musicDetail.a11y.playbackRate', {
                        value: rateLabel,
                    })}
                    onPress={() => showPlaybackRatePicker(rate)}
                />
            )}
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
        // 行上下呼吸留白（内容居中，命中区仍 ≥ 44）
        paddingVertical: space.sm,
    },
});
