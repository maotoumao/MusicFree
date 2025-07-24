import React from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import PanelFullscreen from "@/components/panels/base/panelFullscreen.tsx";
import AppBar from "@/components/base/appBar.tsx";
import { hidePanel } from "@/components/panels/usePanel.ts";
import globalStyle from "@/constants/globalStyle.ts";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView.tsx";
import { FlashList } from "@shopify/flash-list";
import FastImage from "@/components/base/fastImage";
import { ImgAsset } from "@/constants/assetsConst.ts";
import ThemeText from "@/components/base/themeText.tsx";
import Comment from "@/components/panels/types/musicComment/comment.tsx";
import useComments from "@/components/panels/types/musicComment/useComments.ts";
import { RequestStateCode } from "@/constants/commonConst.ts";
import { useI18N } from "@/core/i18n";
import ListEmpty from "@/components/base/listEmpty";
import ListFooter from "@/components/base/listFooter";

interface IMusicCommentProps {
    musicItem: IMusic.IMusicItem;
}


export default function MusicComment(props: IMusicCommentProps) {
    const { musicItem } = props;

    const [reqState, comments, getMusicComments] = useComments(musicItem);
    const { t } = useI18N();


    const listBody = <FlashList
        ListFooterComponent={comments?.length ? <ListFooter state={reqState} onRetry={getMusicComments} /> : null}
        ListEmptyComponent={<ListEmpty state={reqState} onRetry={getMusicComments} />}
        estimatedItemSize={100}
        renderItem={({ item }) => {
            return <Comment comment={item} />;
        }}
        onEndReachedThreshold={0.1}
        onEndReached={() => {
            if (reqState === RequestStateCode.IDLE || reqState === RequestStateCode.PARTLY_DONE) {
                getMusicComments();
            }
        }}
        data={comments}
    />;

    return (
        <PanelFullscreen>
            <VerticalSafeAreaView style={globalStyle.fwflex1}>
                <AppBar withStatusBar children={t("common.comment")} onBackPress={hidePanel} />
                <View style={styles.musicItemContainer}>
                    <FastImage
                        style={styles.musicItemArtwork}
                        source={musicItem?.artwork}
                        placeholderSource={ImgAsset.albumDefault}
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
        flexDirection: "row",
        alignItems: "center",
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
