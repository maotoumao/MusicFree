import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import PanelFullscreen from '@/components/panels/base/panelFullscreen.tsx';
import AppBar from '@/components/base/appBar.tsx';
import {hidePanel} from '@/components/panels/usePanel.ts';
import globalStyle from '@/constants/globalStyle.ts';
import VerticalSafeAreaView from '@/components/base/verticalSafeAreaView.tsx';
import Loading from '@/components/base/loading.tsx';
import {FlashList} from '@shopify/flash-list';
import FastImage from '@/components/base/fastImage';
import {ImgAsset} from '@/constants/assetsConst.ts';
import ThemeText from '@/components/base/themeText.tsx';
import Comment from '@/components/panels/types/musicComment/comment.tsx';
import useComments from '@/components/panels/types/musicComment/useComments.ts';
import {RequestStateCode} from '@/constants/commonConst.ts';
import Empty from '@/components/base/empty.tsx';

interface IMusicCommentProps {
    musicItem: IMusic.IMusicItem;
}
//
// const comments: IMedia.IComment[] = [
//     {
//         nickName: '猫头猫',
//         comment: '这是一条测试评论\ndsadasdas',
//         avatar: 'https://img2.baidu.com/it/u=1028011339,1319212411&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=313',
//         location: '北京',
//         createAt: Date.now(),
//         like: 200,
//     },
//     {
//         nickName: '猫头猫',
//         comment: '这是一条测试评论\ndsadasdas',
//         avatar: 'https://img2.baidu.com/it/u=1028011339,1319212411&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=313',
//         createAt: Date.now(),
//         like: 200,
//     },
//     {
//         nickName: '猫头猫',
//         comment: '这是一条测试评论\ndsadasdas',
//         avatar: 'https://img2.baidu.com/it/u=1028011339,1319212411&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=313',
//         like: 200000,
//     },
//     {
//         nickName: '猫头猫',
//         comment: '这是一条测试评论\ndsadasdas',
//         avatar: 'https://img2.baidu.com/it/u=1028011339,1319212411&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=313',
//     },
//     {
//         nickName: '猫头猫',
//         comment: '这是一条测试评论\ndsadasdas',
//         avatar: 'https://img2.baidu.com/it/u=1028011339,1319212411&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=313',
//         createAt: Date.now(),
//         like: 200,
//     },
//     {
//         nickName: '猫头猫',
//         comment: '这是一条测试评论\ndsadasdas',
//         avatar: 'https://img2.baidu.com/it/u=1028011339,1319212411&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=313',
//         createAt: Date.now(),
//         like: 200,
//     },
//     {
//         nickName: '猫头猫',
//         comment: '这是一条测试评论\ndsadasdas',
//         avatar: 'https://img2.baidu.com/it/u=1028011339,1319212411&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=313',
//         createAt: Date.now(),
//         like: 200,
//     },
//     {
//         nickName: '猫头猫',
//         comment: '这是一条测试评论\ndsadasdas',
//         avatar: 'https://img2.baidu.com/it/u=1028011339,1319212411&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=313',
//         createAt: Date.now(),
//         like: 200,
//     },
//     {
//         nickName: '猫头猫',
//         comment: '这是一条测试评论\ndsadasdas',
//         avatar: 'https://img2.baidu.com/it/u=1028011339,1319212411&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=313',
//         createAt: Date.now(),
//         like: 200,
//     },
// ];

export default function MusicComment(props: IMusicCommentProps) {
    const {musicItem} = props;

    const [reqState, comments] = useComments(musicItem);

    let listBody = <></>;

    if (reqState & RequestStateCode.LOADING) {
        listBody = <Loading />;
    } else if (reqState === RequestStateCode.ERROR) {
        listBody = <Empty />;
    } else {
        listBody = (
            <FlashList
                ListEmptyComponent={<Empty />}
                estimatedItemSize={100}
                renderItem={({item}) => {
                    return <Comment comment={item} />;
                }}
                data={comments}
            />
        );
    }

    return (
        <PanelFullscreen>
            <VerticalSafeAreaView style={globalStyle.fwflex1}>
                <AppBar withStatusBar children="评论" onBackPress={hidePanel} />
                <View style={styles.musicItemContainer}>
                    <FastImage
                        style={styles.musicItemArtwork}
                        uri={musicItem?.artwork}
                        emptySrc={ImgAsset.albumDefault}
                    />
                    <View style={styles.musicItemContent}>
                        <ThemeText fontSize="subTitle" numberOfLines={1}>
                            {musicItem.title}
                        </ThemeText>
                        <ThemeText
                            fontSize="description"
                            numberOfLines={1}
                            fontColor="textSecondary">
                            {musicItem.artist}
                        </ThemeText>
                    </View>
                </View>
                {listBody}
            </VerticalSafeAreaView>
        </PanelFullscreen>
    );
}

const styles = StyleSheet.create({
    musicItemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: rpx(16),
        paddingHorizontal: rpx(24),
        height: rpx(120),
    },
    musicItemArtwork: {
        width: rpx(88),
        height: rpx(88),
        borderRadius: rpx(12),
    },
    musicItemContent: {
        flex: 1,
        gap: rpx(16),
    },
});
