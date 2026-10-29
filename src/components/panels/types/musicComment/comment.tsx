import React from "react";
import { StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import FastImage from "@/components/base/fastImage.tsx";
import ThemeText from "@/components/base/themeText.tsx";
import { fontSizeConst } from "@/constants/uiConst.ts";
import dayjs from "dayjs";
import Icon from "@/components/base/icon.tsx";
import useColors from "@/hooks/useColors.ts";

interface ICommentProps {
    comment: IMedia.IComment;
    // 是否作为子评论渲染
    isReply?: boolean;
}

export default function Comment(props: ICommentProps) {
    const { comment, isReply } = props;

    const hasFooter = comment.like || comment.createAt || comment.location;
    const colors = useColors();

    return (
        <View style={isReply ? styles.replyContainer : styles.container}>
            <View style={styles.headerLine}>
                <FastImage source={comment.avatar} style={styles.avatar} />
                <ThemeText numberOfLines={1} fontSize={"subTitle"}>
                    {comment.nickName}
                </ThemeText>
            </View>
            <View style={styles.content}>
                <ThemeText fontSize="description" style={styles.commentText}>
                    {comment.comment}
                </ThemeText>
            </View>
            {hasFooter ? (
                <View style={styles.footer}>
                    <ThemeText
                        fontSize="description"
                        fontColor="textSecondary"
                        numberOfLines={1}>
                        {comment.createAt
                            ? dayjs(comment.createAt).format("YYYY-MM-DD") + " "
                            : ""}
                        {comment.location}
                    </ThemeText>
                    {comment.like ? (
                        <View style={styles.like}>
                            <Icon
                                name="hand-thumb-up"
                                size={fontSizeConst.content}
                                color={colors.textSecondary}
                            />
                            <ThemeText
                                fontSize="description"
                                fontColor="textSecondary"
                                numberOfLines={1}>
                                {comment.like}
                            </ThemeText>
                        </View>
                    ) : null}
                </View>
            ) : null}
            {comment.replies?.length ? (
                <View style={styles.replies}>
                    {comment.replies.map((reply, index) => (
                        <Comment
                            key={reply.id ?? index}
                            comment={reply}
                            isReply
                        />
                    ))}
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: rpx(24),
        width: "100%",
        gap: rpx(16),
    },
    avatar: {
        width: rpx(48),
        height: rpx(48),
        borderRadius: rpx(24),
    },
    headerLine: {
        flexDirection: "row",
        alignItems: "center",
        gap: rpx(16),
    },
    content: {
        paddingLeft: rpx(64),
    },
    commentText: {
        lineHeight: 1.6 * fontSizeConst.description,
    },
    footer: {
        paddingLeft: rpx(64),
        flexDirection: "row",
        justifyContent: "space-between",
    },
    replyContainer: {
        width: "100%",
        gap: rpx(16),
    },
    replies: {
        paddingLeft: rpx(64),
        gap: rpx(24),
    },
    like: {
        flexDirection: "row",
        columnGap: rpx(6),
        alignItems: "center",
    },
});
