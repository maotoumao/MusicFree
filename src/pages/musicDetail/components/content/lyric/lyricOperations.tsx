import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {iconSizeConst} from '@/constants/uiConst';
import TranslationIcon from '@/assets/icons/translation.svg';
import Config from '@/core/config';
import useColors from '@/hooks/useColors';
import LyricManager from '@/core/lyricManager';
import Toast from '@/utils/toast';
import {hidePanel, showPanel} from '@/components/panels/usePanel';
import TrackPlayer from '@/core/trackPlayer';
import MediaExtra from '@/core/mediaExtra';
import PersistStatus from '@/core/persistStatus';
import useOrientation from '@/hooks/useOrientation';
import HeartIcon from '../heartIcon';
import Icon from '@/components/base/icon.tsx';

interface ILyricOperationsProps {
    scrollToCurrentLrcItem: () => void;
}

export default function LyricOperations(props: ILyricOperationsProps) {
    const {scrollToCurrentLrcItem} = props;

    const lyricConfig = Config.useConfig('setting.lyric');

    const hasTranslation = LyricManager.useLyricState()?.hasTranslation;
    const showTranslation = PersistStatus.useValue(
        'lyric.showTranslation',
        false,
    );
    const colors = useColors();
    const orientation = useOrientation();

    return (
        <View style={styles.container}>
            {orientation === 'vertical' ? <HeartIcon /> : null}
            <Icon
                name="font-size"
                size={iconSizeConst.normal}
                color="white"
                onPress={() => {
                    showPanel('SetFontSize', {
                        defaultSelect: lyricConfig?.detailFontSize ?? 1,
                        onSelectChange(value) {
                            PersistStatus.set('lyric.detailFontSize', value);
                            scrollToCurrentLrcItem();
                        },
                    });
                }}
            />
            <Icon
                name="arrows-left-right"
                size={iconSizeConst.normal}
                color="white"
                onPress={() => {
                    const currentMusicItem = TrackPlayer.getCurrentMusic();

                    if (currentMusicItem) {
                        showPanel('SetLyricOffset', {
                            musicItem: currentMusicItem,
                            onSubmit(offset) {
                                MediaExtra.update(currentMusicItem, {
                                    lyricOffset: offset,
                                });
                                LyricManager.refreshLyric();
                                scrollToCurrentLrcItem();
                                hidePanel();
                            },
                        });
                    }
                }}
            />

            <Icon
                name="magnifying-glass"
                size={iconSizeConst.normal}
                color="white"
                onPress={() => {
                    const currentMusic = TrackPlayer.getCurrentMusic();
                    if (!currentMusic) {
                        return;
                    }
                    // if (
                    //     Config.get('setting.basic.associateLyricType') ===
                    //     'input'
                    // ) {
                    //     showPanel('AssociateLrc', {
                    //         musicItem: currentMusic,
                    //     });
                    // } else {
                    showPanel('SearchLrc', {
                        musicItem: currentMusic,
                    });
                    // }
                }}
            />
            <TranslationIcon
                width={iconSizeConst.normal}
                height={iconSizeConst.normal}
                opacity={!hasTranslation ? 0.2 : showTranslation ? 1 : 0.5}
                color={
                    showTranslation && hasTranslation ? colors.primary : 'white'
                }
                // style={}
                onPress={() => {
                    if (!hasTranslation) {
                        Toast.warn('当前歌曲无翻译');
                        return;
                    }

                    PersistStatus.set(
                        'lyric.showTranslation',
                        !showTranslation,
                    );
                    scrollToCurrentLrcItem();
                }}
            />
            <Icon
                name="ellipsis-vertical"
                size={iconSizeConst.normal}
                color={'white'}
                onPress={() => {
                    const currentMusic = TrackPlayer.getCurrentMusic();
                    if (currentMusic) {
                        showPanel('MusicItemLyricOptions', {
                            musicItem: currentMusic,
                        });
                    }
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: rpx(80),
        marginBottom: rpx(24),
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
});
