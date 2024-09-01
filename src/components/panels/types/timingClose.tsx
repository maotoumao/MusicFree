import React, {useCallback, useEffect, useRef} from 'react';
import {StyleSheet, TouchableOpacity, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';

import {setTimingClose, useTimingClose} from '@/utils/timingClose';
import ThemeSwitch from '@/components/base/switch';
import timeformat from '@/utils/timeformat';
import PanelBase from '../base/panelBase';
import {FlatList} from 'react-native-gesture-handler';
import {atom, useAtom, useAtomValue, useSetAtom} from 'jotai';
import {debounce} from 'lodash';
import Divider from '@/components/base/divider';
import useColors from '@/hooks/useColors';
import PanelHeader from '../base/panelHeader';

// const hours = Array(24).fill(1).map(_ => _.index);
// const mins = Array(60).fill(1).map(_ => _.index);

const shortCutTimes = [null, 15, 30, 45, 60] as const;

const shortCutAtom = atom<15 | 30 | 45 | 60 | null>(null);

// 全局的时间
let selectedHour = '0';
let selectedMin = '15';

function getDeadlineTimestamp(hour: string | number, min: string | number) {
    const [_hour, _min] = [+hour, +min];
    if (!_hour && !_min) {
        return Date.now() + 60000;
    }

    return Date.now() + (_hour * 60 + _min) * 60000;
}

function CountDownHeader() {
    const countDown = useTimingClose();
    const shortCutValue = useAtomValue(shortCutAtom);

    return (
        <View style={style.header}>
            <PanelHeader
                hideDivider
                hideButtons
                title={
                    countDown === null
                        ? '定时关闭'
                        : `倒计时 ${timeformat(countDown)}`
                }
            />

            <ThemeSwitch
                value={countDown !== null}
                style={style.switch}
                onValueChange={val => {
                    if (val === true) {
                        if (shortCutValue) {
                            setTimingClose(
                                getDeadlineTimestamp(0, shortCutValue),
                            );
                            return;
                        }
                        setTimingClose(
                            getDeadlineTimestamp(selectedHour, selectedMin),
                        );
                    } else {
                        setTimingClose(null);
                    }
                }}
            />
        </View>
    );
}

const ITEM_HEIGHT = rpx(82);
const hours = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const minutes = Array(60)
    .fill(0)
    .map((_, index) => index);

const EmptyItem = () => <View style={numScrollStyles.emptyItem} />;

function NumScrollView() {
    const setShortCut = useSetAtom(shortCutAtom);

    const minListRef = useRef<FlatList<number> | null>();
    const minOffsetYRef = useRef<number>(0);

    const resetTimer = () => {
        setShortCut(null);
        setTimingClose(null);
    };

    const onMinMomentumScrollEnd = useCallback(
        debounce(
            () => {
                selectedMin = `${(minOffsetYRef.current / ITEM_HEIGHT).toFixed(
                    0,
                )}`;
                minListRef.current?.scrollToIndex({
                    index: +selectedMin,
                });
            },
            50,
            {
                leading: false,
                trailing: true,
            },
        ),
        [],
    );

    return (
        <View style={numScrollStyles.customTime}>
            <View style={numScrollStyles.listWrapper}>
                <FlatList
                    showsVerticalScrollIndicator={false}
                    overScrollMode="never"
                    ListHeaderComponent={EmptyItem}
                    ListFooterComponent={EmptyItem}
                    getItemLayout={(_, index) => ({
                        length: ITEM_HEIGHT,
                        offset: ITEM_HEIGHT * index,
                        index,
                    })}
                    fadingEdgeLength={100}
                    onMomentumScrollEnd={e => {
                        selectedHour = `${(
                            e.nativeEvent.contentOffset.y / ITEM_HEIGHT
                        ).toFixed(0)}`;
                    }}
                    onScrollEndDrag={e => {
                        selectedHour = `${(
                            e.nativeEvent.contentOffset.y / ITEM_HEIGHT
                        ).toFixed(0)}`;
                    }}
                    onScrollBeginDrag={() => {
                        resetTimer();
                    }}
                    disableIntervalMomentum
                    snapToInterval={ITEM_HEIGHT}
                    style={numScrollStyles.list}
                    contentContainerStyle={numScrollStyles.listContent}
                    data={hours}
                    renderItem={({item}) => (
                        <ThemeText style={numScrollStyles.item}>
                            {item} 时
                        </ThemeText>
                    )}
                />
                <FlatList
                    ref={ref => {
                        minListRef.current = ref;
                    }}
                    showsVerticalScrollIndicator={false}
                    overScrollMode="never"
                    fadingEdgeLength={100}
                    ListHeaderComponent={EmptyItem}
                    ListFooterComponent={EmptyItem}
                    style={[numScrollStyles.list, numScrollStyles.minList]}
                    contentContainerStyle={numScrollStyles.listContent}
                    getItemLayout={(_, index) => ({
                        length: ITEM_HEIGHT,
                        offset: ITEM_HEIGHT * index,
                        index,
                    })}
                    initialScrollIndex={15}
                    onScrollBeginDrag={() => {
                        resetTimer();
                    }}
                    onMomentumScrollEnd={e => {
                        minOffsetYRef.current = e.nativeEvent.contentOffset.y;
                        onMinMomentumScrollEnd();
                    }}
                    onScrollEndDrag={e => {
                        selectedMin = `${(
                            e.nativeEvent.contentOffset.y / ITEM_HEIGHT
                        ).toFixed(0)}`;
                    }}
                    data={minutes}
                    renderItem={({item}) => (
                        <ThemeText style={numScrollStyles.item}>
                            {item} 分
                        </ThemeText>
                    )}
                />
                <View
                    style={numScrollStyles.topBanner}
                    pointerEvents={'none'}
                />
                <View
                    style={numScrollStyles.bottomBanner}
                    pointerEvents={'none'}
                />
            </View>
        </View>
    );
}

const numScrollStyles = StyleSheet.create({
    customTime: {
        marginTop: rpx(72),
        flex: 1,
    },
    listWrapper: {
        flexDirection: 'row',
        width: '100%',
    },
    emptyItem: {
        width: '100%',
        height: ITEM_HEIGHT,
    },
    list: {
        height: 3 * ITEM_HEIGHT,
    },
    minList: {
        marginLeft: rpx(28),
    },
    listContent: {
        width: '100%',
    },
    item: {
        height: ITEM_HEIGHT,
        width: '100%',
        textAlign: 'center',
        textAlignVertical: 'center',
    },
    topBanner: {
        position: 'absolute',
        height: rpx(1),
        width: '100%',
        top: ITEM_HEIGHT - rpx(0.5),
        left: 0,
        backgroundColor: '#aaaaaa33',
        borderBottomColor: '#666666',
        borderBottomWidth: 1,
    },
    bottomBanner: {
        position: 'absolute',
        height: rpx(1),
        width: '100%',
        borderTopColor: '#666666',
        borderTopWidth: 1,
        bottom: ITEM_HEIGHT + rpx(0.5),
        left: 0,
        backgroundColor: '#aaaaaa33',
    },
});

export default function TimingClose() {
    const colors = useColors();
    // const highlightBgColor = useMemo(
    //     () => Color(colors.textHighlight).alpha(0.3).toString(),
    //     [colors],
    // );

    const [selectedShortCut, setSelectedShortCut] = useAtom(shortCutAtom);

    useEffect(() => {
        return () => {
            selectedHour = '0';
            selectedMin = '15';
        };
    }, []);

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
                                                          colors.primary,
                                                  }
                                                : undefined,
                                        ]}>
                                        <ThemeText
                                            fontColor={
                                                selectedShortCut === time
                                                    ? 'appBarText'
                                                    : 'text'
                                            }>
                                            {time ? `${time}min` : '自定义'}
                                        </ThemeText>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <NumScrollView />
                    </View>
                </>
            )}
        />
    );
}

const style = StyleSheet.create({
    header: {
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
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
    },
    switch: {
        position: 'absolute',
        right: rpx(32),
    },
    timesGroup: {
        width: rpx(702),
        height: rpx(108),
        paddingHorizontal: rpx(24),
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
