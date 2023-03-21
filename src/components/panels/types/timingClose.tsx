import React, {useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {Divider, TextInput, useTheme} from 'react-native-paper';
import ThemeText from '@/components/base/themeText';

import {setTimingClose, useTimingClose} from '@/utils/timingClose';
import ThemeSwitch from '@/components/base/switch';
import timeformat from '@/utils/timeformat';
import PanelBase from '../base/panelBase';
import {TouchableOpacity} from 'react-native-gesture-handler';
import Color from 'color';
import {atom, useAtom, useAtomValue} from 'jotai';

// const hours = Array(24).fill(1).map(_ => _.index);
// const mins = Array(60).fill(1).map(_ => _.index);

const shortCutTimes = [null, 15, 30, 45, 60] as const;

const selectedHourAtom = atom('0');
const selectMinAtom = atom('15');

function CountDownHeader() {
    const countDown = useTimingClose();
    const selectedHour = useAtomValue(selectedHourAtom);
    const selectedMin = useAtomValue(selectMinAtom);

    return (
        <View style={style.header}>
            <ThemeText fontWeight="medium">
                {countDown === null
                    ? '定时关闭'
                    : `倒计时 ${timeformat(countDown)}`}
            </ThemeText>
            <ThemeSwitch
                value={countDown !== null}
                onChange={console.log}
                onValueChange={val => {
                    if (val === true) {
                        setTimingClose(
                            Date.now() +
                                ((+selectedHour || 0) * 60 +
                                    (+selectedMin || 1)) *
                                    60000,
                        );
                    } else {
                        setTimingClose(null);
                    }
                }}
            />
        </View>
    );
}

export default function TimingClose() {
    const {colors} = useTheme();
    const highlightBgColor = useMemo(
        () => Color(colors.textHighlight).alpha(0.3).toString(),
        [colors],
    );

    const [selectedHour, setSelectedHour] = useAtom(selectedHourAtom);
    const [selectedMin, setSelectedMin] = useAtom(selectMinAtom);
    const [selectedShortCut, setSelectedShortCut] = useState<
        15 | 30 | 45 | 60 | null
    >(null);

    return (
        <PanelBase
            height={rpx(750)}
            renderBody={() => (
                <>
                    <CountDownHeader />
                    <Divider />
                    <View style={style.countdown}>
                        <View style={style.timesGroup}>
                            {shortCutTimes.map(time => (
                                <TouchableOpacity
                                    key={`countdown-timer-${time}`}
                                    onPress={() => {
                                        if (selectedShortCut !== time) {
                                            setSelectedShortCut(time);
                                            if (time) {
                                                setTimingClose(
                                                    Date.now() + time * 60000,
                                                );
                                            } else {
                                                setTimingClose(
                                                    Date.now() +
                                                        ((+selectedHour || 0) *
                                                            60 +
                                                            (+selectedMin ||
                                                                1)) *
                                                            60000,
                                                );
                                            }
                                        }
                                    }}>
                                    <View
                                        style={[
                                            style.time,
                                            selectedShortCut === time
                                                ? {
                                                      backgroundColor:
                                                          highlightBgColor,
                                                  }
                                                : undefined,
                                        ]}>
                                        <ThemeText
                                            fontColor={
                                                selectedShortCut === time
                                                    ? 'highlight'
                                                    : 'normal'
                                            }>
                                            {time ? `${time}min` : '自定义'}
                                        </ThemeText>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={style.customTime}>
                            <TextInput
                                style={style.textInput}
                                keyboardType="number-pad"
                                maxLength={2}
                                value={selectedHour ?? ''}
                                onChangeText={t => {
                                    setSelectedHour(t.trim());
                                }}
                            />
                            <ThemeText>小时</ThemeText>
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
                    </View>
                </>
            )}
        />
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
        flex: 1,
        marginTop: rpx(64),
        paddingHorizontal: rpx(24),
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
    },
    timesGroup: {
        width: rpx(702),
        height: rpx(108),
        // backgroundColor: 'blue',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    time: {
        width: rpx(108),
        height: rpx(108),
        borderRadius: rpx(108),
        backgroundColor: '#99999999',
        alignItems: 'center',
        justifyContent: 'center',
    },
    highlightTime: {
        width: rpx(108),
        height: rpx(108),
        borderRadius: rpx(108),
        backgroundColor: '#99999999',
        alignItems: 'center',
        justifyContent: 'center',
    },
    customTime: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: rpx(32),
        flex: 1,
    },
    textInput: {
        backgroundColor: '#99999999',
    },
});
