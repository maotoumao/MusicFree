import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import ActionButton from '../ActionButton';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import {ScrollView} from 'react-native-gesture-handler';

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
        <ScrollView style={styles.container}>
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
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        width: rpx(200),
        flexGrow: 0,
        flexShrink: 0,
        paddingHorizontal: rpx(24),
        marginVertical: rpx(32),
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    actionButtonStyle: {
        width: rpx(157.5),
        height: rpx(160),
        borderRadius: rpx(18),
    },
    actionMarginLeft: {
        marginTop: rpx(24),
    },
});
