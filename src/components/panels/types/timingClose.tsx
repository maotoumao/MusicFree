import React, {useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import BottomSheet, {BottomSheetBackdrop} from '@gorhom/bottom-sheet';
import {Divider, TextInput} from 'react-native-paper';
import {_usePanel} from '../usePanel';
import ThemeText from '@/components/base/themeText';
import usePrimaryColor from '@/hooks/usePrimaryColor';
import {BottomSheetMethods} from '@gorhom/bottom-sheet/lib/typescript/types';

import {setTimingClose, useTimingClose} from '@/utils/timingClose';
import ThemeSwitch from '@/components/base/swtich';
import timeformat from '@/utils/timeformat';

// const hours = Array(24).fill(1).map(_ => _.index);
// const mins = Array(60).fill(1).map(_ => _.index);

export default function TimingClose() {
    const sheetRef = useRef<BottomSheetMethods | null>();
    const {unmountPanel} = _usePanel(sheetRef);
    const primaryColor = usePrimaryColor();
    const countDown = useTimingClose();

    const [selectedHour, setSelectedHour] = useState('0');
    const [selectedMin, setSelectedMin] = useState('15');

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
            snapPoints={['50%']}
            enablePanDownToClose
            enableOverDrag={false}
            onClose={unmountPanel}>
            <View style={style.header}>
                <ThemeText fontWeight="medium">
                    {countDown === null
                        ? '定时关闭'
                        : `倒计时 ${timeformat(countDown)}`}
                </ThemeText>
                <ThemeSwitch
                    value={countDown !== null}
                    onValueChange={val => {
                        if (val === true) {
                            setTimingClose(
                                Date.now() +
                                    ((parseInt(selectedHour) || 0) * 60 +
                                        (parseInt(selectedMin) || 1)) *
                                        60000,
                            );
                        } else {
                            setTimingClose(null);
                        }
                    }}
                />
            </View>
            <Divider />
            <View style={style.countdown}>
                <TextInput
                    style={style.textInput}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={selectedHour ?? ''}
                    onChangeText={t => {
                        setSelectedHour(t.trim());
                    }}
                />
                <ThemeText>小时 </ThemeText>
                <TextInput
                    style={style.textInput}
                    maxLength={2}
                    keyboardType="number-pad"
                    value={selectedMin ?? ''}
                    onChangeText={t => {
                        setSelectedMin(t.trim());
                    }}
                />
                <ThemeText>分钟</ThemeText>
            </View>
        </BottomSheet>
    );
}

const style = StyleSheet.create({
    header: {
        marginTop: rpx(36),
        width: rpx(750),
        paddingHorizontal: rpx(24),
        height: rpx(90),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    countdown: {
        width: rpx(750),
        paddingHorizontal: rpx(24),
        flexDirection: 'row',
        marginTop: rpx(120),
        justifyContent: 'center',
        alignItems: 'center',
    },
    textInput: {
        backgroundColor: '#99999999',
    },
});
