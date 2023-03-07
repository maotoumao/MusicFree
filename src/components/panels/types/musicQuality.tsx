import React, {Fragment, useRef} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import {Divider} from 'react-native-paper';
import ThemeText from '@/components/base/themeText';
import usePrimaryColor from '@/hooks/usePrimaryColor';
import {BottomSheetMethods} from '@gorhom/bottom-sheet/lib/typescript/types';

import usePanel from '../usePanel';
import {qualityKeys, qualityText} from '@/utils/qualities';
import {sizeFormatter} from '@/utils/fileUtils';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

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
    const sheetRef = useRef<BottomSheetMethods | null>();
    const {unmountPanel} = usePanel();
    const primaryColor = usePrimaryColor();
    const safeAreaInsets = useSafeAreaInsets();

    const {musicItem, onQualityPress} = props ?? {};

    return (
        <BottomSheet
            ref={_ => (sheetRef.current = _)}
            backdropComponent={props => {
                return (
                    <BottomSheetBackdrop
                        disappearsOnIndex={-1}
                        pressBehavior={'close'}
                        opacity={0.5}
                        {...props}
                    />
                );
            }}
            backgroundStyle={{backgroundColor: primaryColor}}
            handleComponent={null}
            index={0}
            snapPoints={[rpx(520)]}
            enablePanDownToClose
            enableOverDrag={false}
            onClose={unmountPanel}>
            <View style={style.header}>
                <ThemeText fontWeight="bold" fontSize="title">
                    音质选择
                </ThemeText>
            </View>
            <BottomSheetScrollView
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
                                    sheetRef.current?.close();
                                }}>
                                <ThemeText>
                                    {qualityText[key]}{' '}
                                    {musicItem.qualities?.[key]?.size
                                        ? `(${sizeFormatter(
                                              musicItem.qualities[key].size!,
                                          )})`
                                        : ''}
                                </ThemeText>
                            </Pressable>
                        </Fragment>
                    );
                })}
                <Divider />
            </BottomSheetScrollView>
        </BottomSheet>
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
