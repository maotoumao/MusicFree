import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ActionButton from '../ActionButton';
import {ROUTE_PATH, useNavigate} from '@/entry/router';

export default function Operations() {
    const navigate = useNavigate();

    const actionButtons = [
        {
            iconName: 'fire',
            title: '推荐歌单',
            action() {
                navigate(ROUTE_PATH.RECOMMEND_SHEETS);
            },
        },
        {
            iconName: 'trophy',
            title: '榜单',
            action() {
                navigate(ROUTE_PATH.TOP_LIST);
            },
        },
        {
            iconName: 'clock-outline',
            title: '播放记录',
            action() {
                navigate(ROUTE_PATH.HISTORY);
            },
        },
        {
            iconName: 'folder-music-outline',
            title: '本地音乐',
            action() {
                navigate(ROUTE_PATH.LOCAL);
            },
        },
    ] as const;

    return (
        <View style={styles.container}>
            {actionButtons.map((action, index) => (
                <ActionButton
                    style={[
                        styles.actionButtonStyle,
                        index % 4 ? styles.actionMarginLeft : null,
                    ]}
                    key={action.title}
                    {...action}
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: rpx(750),
        paddingHorizontal: rpx(24),
        marginVertical: rpx(32),
        flexDirection: 'row',
        flexWrap: 'nowrap',
    },
    actionButtonStyle: {
        width: rpx(157.5),
        height: rpx(160),
        borderRadius: rpx(18),
    },
    actionMarginLeft: {
        marginLeft: rpx(24),
    },
});
