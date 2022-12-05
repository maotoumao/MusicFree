import React, {useRef} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import BottomSheet, {BottomSheetBackdrop} from '@gorhom/bottom-sheet';
import {Divider} from 'react-native-paper';
import ThemeText from '@/components/base/themeText';
import usePrimaryColor from '@/hooks/usePrimaryColor';
import {BottomSheetMethods} from '@gorhom/bottom-sheet/lib/typescript/types';

import usePanel from '../usePanel';
import {qualityKeys, qualityText} from '@/utils/qualities';
import {sizeFormatter} from '@/utils/fileUtils';

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
            snapPoints={[rpx(400)]}
            enablePanDownToClose
            enableOverDrag={false}
            onClose={unmountPanel}>
            <View style={style.header}>
                <ThemeText fontWeight="bold">音质选择</ThemeText>
            </View>
            <View style={style.body}>
                {qualityKeys.map(key => {
                    return (
                        <>
                            <Divider key={`di-${key}`} />
                            <Pressable
                                key={key}
                                style={style.item}
                                onPress={() => {
                                    onQualityPress(key, musicItem);
                                    sheetRef.current?.close();
                                }}>
                                <ThemeText fontSize="subTitle">
                                    {qualityText[key]}{' '}
                                    {musicItem.qualities?.[key]?.size
                                        ? `(${sizeFormatter(
                                              musicItem.qualities[key].size!,
                                          )})`
                                        : ''}
                                </ThemeText>
                            </Pressable>
                        </>
                    );
                })}
                <Divider />
            </View>
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
        height: rpx(64),
        justifyContent: 'center',
    },
});
