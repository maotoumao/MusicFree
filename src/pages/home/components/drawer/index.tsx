import React, {memo} from 'react';
import {BackHandler, Platform, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {DrawerContentScrollView} from '@react-navigation/drawer';
import ListItem from '@/components/base/listItem';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import ThemeText from '@/components/base/themeText';
import PageBackground from '@/components/base/pageBackground';
import DeviceInfo from 'react-native-device-info';
import deviceInfoModule from 'react-native-device-info';
import NativeUtils from '@/native/utils';
import {useTimingClose} from '@/utils/timingClose';
import timeformat from '@/utils/timeformat';
import {showPanel} from '@/components/panels/usePanel';
import Divider from '@/components/base/divider';
import TrackPlayer from '@/core/trackPlayer';
import {checkUpdateAndShowResult} from '@/hooks/useCheckUpdate.ts';
import {IIconName} from '@/components/base/icon.tsx';

const ITEM_HEIGHT = rpx(108);

interface ISettingOptions {
    icon: IIconName;
    title: string;
    onPress?: () => void;
}

function HomeDrawer(props: any) {
    const navigate = useNavigate();
    function navigateToSetting(settingType: string) {
        navigate(ROUTE_PATH.SETTING, {
            type: settingType,
        });
    }

    const basicSetting: ISettingOptions[] = [
        {
            icon: 'cog-8-tooth',
            title: '基本设置',
            onPress: () => {
                navigateToSetting('basic');
            },
        },
        {
            icon: 'javascript',
            title: '插件管理',
            onPress: () => {
                navigateToSetting('plugin');
            },
        },
        {
            icon: 't-shirt-outline',
            title: '主题设置',
            onPress: () => {
                navigateToSetting('theme');
            },
        },
    ];

    const otherSetting: ISettingOptions[] = [
        {
            icon: 'circle-stack',
            title: '备份与恢复',
            onPress: () => {
                navigateToSetting('backup');
            },
        },
    ];

    if (Platform.OS === 'android') {
        otherSetting.push({
            icon: 'shield-keyhole-outline',
            title: '权限管理',
            onPress: () => {
                navigate(ROUTE_PATH.PERMISSIONS);
            },
        });
    }

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
                    <ListItem withHorizontalPadding heightType="smallest">
                        <ListItem.ListItemText
                            fontSize="subTitle"
                            fontWeight="bold">
                            设置
                        </ListItem.ListItemText>
                    </ListItem>
                    {basicSetting.map(item => (
                        <ListItem
                            withHorizontalPadding
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
                    <ListItem withHorizontalPadding heightType="smallest">
                        <ListItem.ListItemText
                            fontSize="subTitle"
                            fontWeight="bold">
                            其他
                        </ListItem.ListItemText>
                    </ListItem>
                    <CountDownItem />
                    {otherSetting.map(item => (
                        <ListItem
                            withHorizontalPadding
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
                    <ListItem withHorizontalPadding heightType="smallest">
                        <ListItem.ListItemText
                            fontSize="subTitle"
                            fontWeight="bold">
                            软件
                        </ListItem.ListItemText>
                    </ListItem>

                    <ListItem
                        withHorizontalPadding
                        key={'update'}
                        onPress={() => {
                            checkUpdateAndShowResult(true);
                        }}>
                        <ListItem.ListItemIcon
                            icon={'arrow-path'}
                            width={rpx(48)}
                        />
                        <ListItem.Content title="检查更新" />
                        <ListItem.ListItemText
                            position="right"
                            fontSize="subTitle">
                            {`当前版本: ${deviceInfoModule.getVersion()}`}
                        </ListItem.ListItemText>
                    </ListItem>
                    <ListItem
                        withHorizontalPadding
                        key={'about'}
                        onPress={() => {
                            navigateToSetting('about');
                        }}>
                        <ListItem.ListItemIcon
                            icon={'information-circle'}
                            width={rpx(48)}
                        />
                        <ListItem.Content
                            title={`关于 ${deviceInfoModule.getApplicationName()}`}
                        />
                    </ListItem>
                </View>

                <Divider />
                <ListItem
                    withHorizontalPadding
                    onPress={() => {
                        // 仅安卓生效
                        BackHandler.exitApp();
                    }}>
                    <ListItem.ListItemIcon
                        icon={'home-outline'}
                        width={rpx(48)}
                    />
                    <ListItem.Content title={'返回桌面'} />
                </ListItem>
                <ListItem
                    withHorizontalPadding
                    onPress={async () => {
                        await TrackPlayer.reset();
                        NativeUtils.exitApp();
                    }}>
                    <ListItem.ListItemIcon
                        icon={'power-outline'}
                        width={rpx(48)}
                    />
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
            withHorizontalPadding
            onPress={() => {
                showPanel('TimingClose');
            }}>
            <ListItem.ListItemIcon icon="alarm-outline" width={rpx(48)} />
            <ListItem.Content title="定时关闭" />
            <ListItem.ListItemText position="right" fontSize="subTitle">
                {countDown ? timeformat(countDown) : ''}
            </ListItem.ListItemText>
        </ListItem>
    );
}

const CountDownItem = memo(_CountDownItem, () => true);
