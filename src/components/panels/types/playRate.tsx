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

interface IPlayRateProps {
    /** 点击回调 */
    onRatePress: (rate: number) => void;
}

const rates = [50, 75, 100, 125, 150, 175, 200];

export default function PlayRate(props: IPlayRateProps) {
    const sheetRef = useRef<BottomSheetMethods | null>();
    const {unmountPanel} = usePanel();
    const primaryColor = usePrimaryColor();

    const {onRatePress} = props ?? {};

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
                    播放速度
                </ThemeText>
            </View>
            <BottomSheetScrollView style={style.body}>
                {rates.map(key => {
                    return (
                        <Fragment key={`frag-${key}`}>
                            <Divider key={`di-${key}`} />
                            <Pressable
                                key={`btn-${key}`}
                                style={style.item}
                                onPress={() => {
                                    onRatePress(key);
                                    sheetRef.current?.close();
                                }}>
                                <ThemeText>{key / 100}x</ThemeText>
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
