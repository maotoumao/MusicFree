import React, {memo} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {DrawerContentScrollView} from '@react-navigation/drawer';
import {Button, Card} from 'react-native-paper';
import ListItem from '@/components/base/listItem';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import ThemeText from '@/components/base/themeText';
import PageBackground from '@/components/base/pageBackground';
import DeviceInfo from 'react-native-device-info';
import NativeUtils from '@/native/utils';
import MusicQueue from '@/core/musicQueue';
import {useTimingClose} from '@/utils/timingClose';
import usePanel from '@/components/panels/usePanel';
import timeformat from '@/utils/timeformat';

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
                <Card style={style.card}>
                    <Card.Title
                        title={
                            <ThemeText fontSize="description">设置</ThemeText>
                        }
                    />
                    <Card.Content style={style.cardContent}>
                        {basicSetting.map(item => (
                            <ListItem
                                itemHeight={ITEM_HEIGHT}
                                key={item.title}
                                left={{
                                    icon: {
                                        name: item.icon,
                                        size: 'normal',
                                        fontColor: 'normal',
                                    },
                                    width: rpx(48),
                                }}
                                title={item.title}
                                onPress={item.onPress}
                            />
                        ))}
                    </Card.Content>
                </Card>
                <Card style={style.card}>
                    <Card.Title
                        title={
                            <ThemeText fontSize="description">其他</ThemeText>
                        }
                    />
                    <Card.Content style={style.cardContent}>
                        <CountDownItem />
                        {otherSetting.map(item => (
                            <ListItem
                                itemHeight={ITEM_HEIGHT}
                                key={item.title}
                                left={{
                                    icon: {
                                        name: item.icon,
                                        size: 'normal',
                                        fontColor: 'normal',
                                    },
                                    width: rpx(48),
                                }}
                                title={item.title}
                                onPress={item.onPress}
                            />
                        ))}
                    </Card.Content>
                </Card>
                <View style={style.bottom}>
                    <Button
                        onPress={async () => {
                            await MusicQueue.reset();
                            NativeUtils.exitApp();
                        }}>
                        <ThemeText>退出</ThemeText>
                    </Button>
                </View>
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
        backgroundColor: '#eeeeee22',
        marginBottom: rpx(24),
    },
    cardContent: {
        paddingHorizontal: 0,
    },
    bottom: {
        height: rpx(100),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    /** 倒计时 */
    countDownText: {
        height: ITEM_HEIGHT,
        textAlignVertical: 'center',
    },
});

function _CountDownItem() {
    const countDown = useTimingClose();
    const {showPanel} = usePanel();

    return (
        <ListItem
            title="定时关闭"
            onPress={() => {
                showPanel('TimingClose');
            }}
            left={{
                icon: {
                    name: 'timer-outline',
                    size: 'normal',
                    fontColor: 'normal',
                },
                width: rpx(48),
            }}
            itemHeight={ITEM_HEIGHT}
            right={() => (
                <ThemeText style={style.countDownText} fontSize="subTitle">
                    {countDown ? timeformat(countDown) : ''}
                </ThemeText>
            )}
        />
    );
}

const CountDownItem = memo(_CountDownItem, () => true);
