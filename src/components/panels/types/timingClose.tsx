import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';

import { setCloseAfterPlayEnd, setScheduleClose, useCloseAfterPlayEnd, useScheduleCloseCountDown } from '@/utils/scheduleClose';
import timeformat from '@/utils/timeformat';
import PanelBase from '../base/panelBase';
import Divider from '@/components/base/divider';
import PanelHeader from '../base/panelHeader';
import Checkbox from '@/components/base/checkbox';
import { Pressable } from 'react-native-gesture-handler';
import { useI18N } from '@/core/i18n';


const shortCutTimes = [null, 10, 20, 30, 45, 60] as const;


function CountDownHeader() {
    const countDown = useScheduleCloseCountDown();
    const { t } = useI18N();

    return (
        <PanelHeader
            hideDivider
            hideButtons            title={countDown === null
                ? t('sidebar.scheduleClose')
                : t('panel.timingClose.countdown', { time: timeformat(countDown) })}
        />
    );
}



export default function TimingClose() {
    const closeAfterPlay = useCloseAfterPlayEnd();
    const { t } = useI18N();

    return (
        <PanelBase
            height={rpx(450)}
            renderBody={() => (
                <>
                    <CountDownHeader />
                    <Divider />
                    <View style={styles.bodyContainer}>
                        {shortCutTimes.map((time, index) => (
                            <TouchableOpacity style={styles.timeItem} key={index} activeOpacity={0.6} onPress={() => {
                                if (time) {
                                    setScheduleClose(
                                        Date.now() + time * 60000,
                                    );
                                } else {
                                    // 取消定时关闭
                                    setScheduleClose(null);
                                }
                            }}>
                                <ThemeText>{time ?? t('panel.timingClose.none')}</ThemeText>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Pressable style={styles.bottomLine} onPress={() => {
                        setCloseAfterPlayEnd(!closeAfterPlay);
                    }}>
                        <Checkbox checked={closeAfterPlay}  />
                        <ThemeText style={styles.bottomLineText}>{t('panel.timingClose.closeAfterPlay')}</ThemeText>
                    </Pressable>

                </>
            )}
        />
    );
}


const styles = StyleSheet.create({
    header: {
        width: rpx(750),
        paddingHorizontal: rpx(24),
        height: rpx(90),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    bodyContainer: {
        width: "100%",
        height: rpx(160),
        padding: rpx(24),
        gap: rpx(16),
        flexDirection: 'row',
    },
    timeItem: {
        flex: 1,
        backgroundColor: '#99999999',
        borderRadius: rpx(12),
        alignItems: 'center',
        justifyContent: 'center'
    },
    bottomLine: {
        width: "100%",
        marginTop: rpx(36),
        paddingRight: rpx(24),
        flexDirection: 'row',
        justifyContent: 'flex-end'
    },
    bottomLineText: {
        marginLeft: rpx(12),
    }
});
