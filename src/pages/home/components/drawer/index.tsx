import React, {memo} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {DrawerContentScrollView} from '@react-navigation/drawer';
import ListItem from '@/components/base/listItem';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import ThemeText from '@/components/base/themeText';
import PageBackground from '@/components/base/pageBackground';
import DeviceInfo from 'react-native-device-info';
import NativeUtils from '@/native/utils';
import MusicQueue from '@/core/musicQueue';
import {useTimingClose} from '@/utils/timingClose';

import timeformat from '@/utils/timeformat';
import {showPanel} from '@/components/panels/usePanel';
import Divider from '@/components/base/divider';

const ITEM_HEIGHT = rpx(108);
function HomeDrawer(props: any) {
    const navigate = useNavigate();
    function navigateToSetting(settingType: string) {
        navigate(ROUTE_PATH.SETTING, {
            type: settingType,
        });
    }

    const basicSetting = [
        {
            icon: 'cog-outline',
            title: '基本设置',
            onPress: () => {
                navigateToSetting('basic');
            },
        },
        {
            icon: 'language-javascript',
            title: '插件设置',
            onPress: () => {
                navigateToSetting('plugin');
            },
        },
        {
            icon: 'tshirt-v-outline',
            title: '主题设置',
            onPress: () => {
                navigateToSetting('theme');
            },
        },
    ] as const;

    const otherSetting = [
        {
            icon: 'backup-restore',
            title: '备份与恢复',
            onPress: () => {
                navigateToSetting('backup');
            },
        },
        {
            icon: 'information-outline',
            title: '关于',
            onPress: () => {
                navigateToSetting('about');
            },
        },
    ] as const;

    return (
        <>
            <PageBackground />
            <DrawerContentScrollView {...[props]} style={style.scrollWrapper}>
                <View style={style.header}>
                    <ThemeText fontSize="appbar" fontWeight="bold">
                        {DeviceInfo.getApplicationName()}
                    </ThemeText>
                    {/* <IconButton icon={'qrcode-scan'} size={rpx(36)} /> */}
                </View>
                <View style={style.card}>
                    <ListItem withHorizonalPadding heightType="small">
                        <ListItem.ListItemText
                            fontSize="subTitle"
                            fontWeight="bold">
                            设置
                        </ListItem.ListItemText>
                    </ListItem>
                    {basicSetting.map(item => (
                        <ListItem
                            withHorizonalPadding
                            key={item.title}
                            onPress={item.onPress}>
                            <ListItem.ListItemIcon
                                icon={item.icon}
                                width={rpx(48)}
                            />
                            <ListItem.Content title={item.title} />
                        </ListItem>
                    ))}
                </View>
                <View style={style.card}>
                    <ListItem withHorizonalPadding heightType="small">
                        <ListItem.ListItemText
                            fontSize="subTitle"
                            fontWeight="bold">
                            其他
                        </ListItem.ListItemText>
                    </ListItem>
                    <CountDownItem />
                    {otherSetting.map(item => (
                        <ListItem
                            withHorizonalPadding
                            key={item.title}
                            onPress={item.onPress}>
                            <ListItem.ListItemIcon
                                icon={item.icon}
                                width={rpx(48)}
                            />
                            <ListItem.Content title={item.title} />
                        </ListItem>
                    ))}
                </View>

                <Divider />
                <ListItem
                    withHorizonalPadding
                    onPress={async () => {
                        await MusicQueue.reset();
                        NativeUtils.exitApp();
                    }}>
                    <ListItem.ListItemIcon icon={'power'} width={rpx(48)} />
                    <ListItem.Content title={'退出应用'} />
                </ListItem>
            </DrawerContentScrollView>
        </>
    );
}

export default memo(HomeDrawer, () => true);

const style = StyleSheet.create({
    wrapper: {
        flex: 1,
        backgroundColor: '#999999',
    },
    scrollWrapper: {
        paddingTop: rpx(12),
    },

    header: {
        height: rpx(120),
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginLeft: rpx(24),
    },
    card: {
        marginBottom: rpx(24),
    },
    cardContent: {
        paddingHorizontal: 0,
    },

    /** 倒计时 */
    countDownText: {
        height: ITEM_HEIGHT,
        textAlignVertical: 'center',
    },
});

function _CountDownItem() {
    const countDown = useTimingClose();

    return (
        <ListItem
            withHorizonalPadding
            onPress={() => {
                showPanel('TimingClose');
            }}>
            <ListItem.ListItemIcon icon="timer-outline" width={rpx(48)} />
            <ListItem.Content title="定时关闭" />
            <ListItem.ListItemText position="right" fontSize="subTitle">
                {countDown ? timeformat(countDown) : ''}
            </ListItem.ListItemText>
        </ListItem>
    );
}

const CountDownItem = memo(_CountDownItem, () => true);
