import React, {useEffect, useRef, useState} from 'react';
import {AppState, StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import AppBar from '@/components/base/appBar';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView';
import globalStyle from '@/constants/globalStyle';
import StatusBar from '@/components/base/statusBar';
import ThemeText from '@/components/base/themeText';
import ListItem from '@/components/base/listItem';
import ThemeSwitch from '@/components/base/switch';
import LyricUtil from '@/native/lyricUtil';
import NativeUtils from '@/native/utils';

type IPermissionTypes = 'floatingWindow' | 'fileStorage';

export default function Permissions() {
    const appState = useRef(AppState.currentState);
    const [permissions, setPermissions] = useState<
        Record<IPermissionTypes, boolean>
    >({
        floatingWindow: false,
        fileStorage: false,
        // background: false,
    });

    async function checkPermission(type?: IPermissionTypes) {
        let newPermission = {
            ...permissions,
        };
        if (!type || type === 'floatingWindow') {
            const hasPermission = await LyricUtil.checkSystemAlertPermission();
            newPermission.floatingWindow = hasPermission;
        }
        if (!type || type === 'fileStorage') {
            const hasPermission = await NativeUtils.checkStoragePermission();
            console.log('HAS', hasPermission);
            newPermission.fileStorage = hasPermission;
        }
        // if (!type || type === 'background') {

        // }

        setPermissions(newPermission);
    }

    useEffect(() => {
        checkPermission();
        const subscription = AppState.addEventListener(
            'change',
            nextAppState => {
                if (
                    appState.current.match(/inactive|background/) &&
                    nextAppState === 'active'
                ) {
                    checkPermission();
                }

                appState.current = nextAppState;
            },
        );

        return () => {
            subscription.remove();
        };
    }, []);

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <AppBar>权限管理</AppBar>
            <ThemeText style={styles.description}>
                此处列出了本 APP
                需要的所有权限，你可以从这里开启或关闭某些权限。
            </ThemeText>
            <ListItem
                withHorizontalPadding
                heightType="big"
                onPress={() => {
                    LyricUtil.requestSystemAlertPermission();
                }}>
                <ListItem.Content
                    title="悬浮窗权限"
                    description="用以展示桌面歌词"
                />
                <ThemeSwitch value={permissions.floatingWindow} />
            </ListItem>
            <ListItem
                withHorizontalPadding
                heightType="big"
                onPress={() => {
                    NativeUtils.requestStoragePermission();
                }}>
                <ListItem.Content
                    title="文件读写权限"
                    description="用以下载歌曲、缓存数据"
                />
                <ThemeSwitch value={permissions.fileStorage} />
            </ListItem>
            {/* <ListItem withHorizontalPadding heightType="big">
                <ListItem.Content
                    title="后台运行"
                    description="用以在后台播放音乐"></ListItem.Content>
                <ThemeSwitch value={permissions.background}></ThemeSwitch>
            </ListItem> */}
        </VerticalSafeAreaView>
    );
}

const styles = StyleSheet.create({
    description: {
        width: '100%',
        paddingHorizontal: rpx(24),
        marginVertical: rpx(36),
    },
});
