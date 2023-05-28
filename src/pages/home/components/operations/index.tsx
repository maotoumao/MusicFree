import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import ActionButton from './ActionButton';
import {ROUTE_PATH, useNavigate} from '@/entry/router';
import {ScrollView} from 'react-native-gesture-handler';

interface IOperationsProps {
    orientation?: 'horizonal' | 'vertical';
}

export default function Operations(props: IOperationsProps) {
    const navigate = useNavigate();
    const {orientation} = props;

    const actionButtons = [
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
            iconName: 'trophy-outline',
            title: '榜单',
            action() {
                navigate(ROUTE_PATH.TOP_LIST);
            },
        },
    ];

    return (
        <ScrollView
            style={style.wrapper}
            horizontal={orientation === 'vertical'}
            contentContainerStyle={
                orientation === 'vertical'
                    ? style.contentWrapper
                    : style.horizonalContentWrapper
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
    contentWrapper: {
        flexDirection: 'row',
        height: rpx(144),
        paddingHorizontal: rpx(24),
    },
    horizonalContentWrapper: {
        width: rpx(170),
        flexDirection: 'column',
        paddingVertical: rpx(24),
    },
});
