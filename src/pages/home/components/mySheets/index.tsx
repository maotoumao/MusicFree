import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import SheetHeader from './sheetHeader';
import SheetBody from './sheetBody';

export default function MySheets() {
    // const {} = useAtom(musicSheet)
    return (
        <View style={style.wrapper}>
            <SheetHeader />
            <SheetBody />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        flexGrow: 1,
        margin: rpx(24),
        width: rpx(702),
        borderRadius: rpx(24),
        paddingHorizontal: rpx(24),
        flexDirection: 'column',
        backgroundColor: '#eeeeee22',
        overflow: 'hidden',
    },
});
