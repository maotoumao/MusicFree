import React, {Fragment} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {Divider} from 'react-native-paper';
import ThemeText from '@/components/base/themeText';
import usePanel from '../usePanel';
import {qualityKeys, qualityText} from '@/utils/qualities';
import {sizeFormatter} from '@/utils/fileUtils';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import PanelBase from '../base/panelBase';
import {ScrollView} from 'react-native-gesture-handler';

interface IMusicQualityProps {
    /** 歌曲信息 */
    musicItem: IMusic.IMusicItem;
    /** 点击回调 */
    onQualityPress: (
        quality: IMusic.IQualityKey,
        musicItem: IMusic.IMusicItem,
    ) => void;
}

export default function MusicQuality(props: IMusicQualityProps) {
    const {hidePanel} = usePanel();
    const safeAreaInsets = useSafeAreaInsets();

    const {musicItem, onQualityPress} = props ?? {};

    return (
        <PanelBase
            height={rpx(520)}
            renderBody={() => (
                <>
                    <View style={style.header}>
                        <ThemeText fontWeight="bold" fontSize="title">
                            音质选择
                        </ThemeText>
                    </View>
                    <ScrollView
                        style={[
                            style.body,
                            {
                                marginBottom: safeAreaInsets.bottom,
                            },
                        ]}>
                        {qualityKeys.map(key => {
                            return (
                                <Fragment key={`frag-${key}`}>
                                    <Divider key={`di-${key}`} />
                                    <Pressable
                                        key={`btn-${key}`}
                                        style={style.item}
                                        onPress={() => {
                                            onQualityPress(key, musicItem);
                                            hidePanel();
                                        }}>
                                        <ThemeText>
                                            {qualityText[key]}{' '}
                                            {musicItem.qualities?.[key]?.size
                                                ? `(${sizeFormatter(
                                                      musicItem.qualities[key]
                                                          .size!,
                                                  )})`
                                                : ''}
                                        </ThemeText>
                                    </Pressable>
                                </Fragment>
                            );
                        })}
                        <Divider />
                    </ScrollView>
                </>
            )}
        />
    );
}

const style = StyleSheet.create({
    header: {
        width: rpx(750),
        flexDirection: 'row',
        padding: rpx(24),
    },
    body: {
        flex: 1,
        paddingHorizontal: rpx(24),
    },
    item: {
        height: rpx(96),
        justifyContent: 'center',
    },
});
