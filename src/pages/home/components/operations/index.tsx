import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ActionButton from './ActionButton';
import {ROUTE_PATH, useNavigate} from '@/entry/router';

export default function Operations() {
    const navigate = useNavigate();

    const actionButtons = [
        {
            iconName: 'heart',
            iconColor: 'red',
            title: '我喜欢',
            action() {
                navigate(ROUTE_PATH.SHEET_DETAIL, {
                    id: 'favorite',
                });
            },
        },
        {
            iconName: 'folder-music-outline',
            title: '本地音乐',
            action() {
                navigate(ROUTE_PATH.LOCAL);
            },
        },
        {
            iconName: 'download',
            title: '下载列表',
            action() {
                navigate(ROUTE_PATH.DOWNLOADING);
            },
        },
        {
            iconName: 'trophy-outline',
            title: '榜单',
            action() {
                navigate(ROUTE_PATH.TOP_LIST);
            },
        },
    ];

    return (
        <View style={style.wrapper}>
            {actionButtons.map(action => (
                <ActionButton key={action.title} {...action} />
            ))}
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flexDirection: 'row',
        height: rpx(144),
        justifyContent: 'space-between',
        paddingHorizontal: rpx(24),
        marginTop: rpx(20),
        marginBottom: rpx(20),
    },
});
