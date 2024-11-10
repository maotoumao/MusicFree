import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import ActionButton from '../ActionButton';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import {ScrollView} from 'react-native-gesture-handler';
import {IIconName} from '@/components/base/icon.tsx';

interface IOperationsProps {
    orientation?: 'horizontal' | 'vertical';
}

interface IActionOption {
    iconName: IIconName;
    iconColor?: string;
    title: string;
    action?: () => void;
}

export default function Operations(props: IOperationsProps) {
    const navigate = useNavigate();
    const {orientation} = props;

    const actionButtons: IActionOption[] = [
        {
            iconName: 'heart',
            iconColor: 'red',
            title: '我喜欢',
            action() {
                navigate(ROUTE_PATH.LOCAL_SHEET_DETAIL, {
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
    ];

    return (
        <ScrollView
            style={
                orientation === 'vertical'
                    ? style.wrapper
                    : style.horizontalWrapper
            }
            scrollEnabled={orientation === 'horizontal'}
            showsHorizontalScrollIndicator={false}
            horizontal={orientation === 'vertical'}
            contentContainerStyle={
                orientation === 'vertical'
                    ? style.contentWrapper
                    : style.horizontalContentWrapper
            }>
            {actionButtons.map(action => (
                <ActionButton key={action.title} {...action} />
            ))}
        </ScrollView>
    );
}

const style = StyleSheet.create({
    wrapper: {
        marginTop: rpx(20),
        marginBottom: rpx(20),
        flexGrow: 0,
        flexShrink: 0,
    },
    horizontalWrapper: {
        marginTop: rpx(20),
        marginBottom: rpx(20),
        flexGrow: 0,
        flexShrink: 0,
    },
    contentWrapper: {
        flexDirection: 'row',
        height: rpx(144),
        paddingHorizontal: rpx(24),
    },
    horizontalContentWrapper: {
        width: rpx(170),
        flexDirection: 'column',
        paddingVertical: rpx(24),
        paddingLeft: rpx(15),
    },
});
