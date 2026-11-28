import { useRecyclingState } from '@shopify/flash-list';
import dayjs from 'dayjs';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { MediaCover } from '@/components/ui/MediaCover';
import { Text } from '@/components/ui/Text';
import { borderWidth, iconSize, layout, space, useColors } from '@/design';
import { formatCount, useT } from '@/i18n';

import type { Comment } from '@/types';

/** 头像直径：根评论 32，回复缩一档 */
const AVATAR_SIZE = 32;
const REPLY_AVATAR_SIZE = 24;
/** 正文默认最多显示行数，超出才给「展开全文」 */
const COLLAPSED_LINES = 6;
/** 单条根评论下最多展示的回复条数：插件可能返回极多回复，超出的不在此页铺开 */
const MAX_REPLIES = 20;

/** 一条评论的正文区（头像右侧内容）；回复复用同一结构、仅尺寸与缩进不同 */
function CommentBody({
    comment,
    isReply,
}: {
    comment: Comment;
    isReply?: boolean;
}) {
    const t = useT();
    // FlashList 复用行实例：换了评论就把展开态归零，否则新评论会继承上一条的展开状态
    // 依赖取评论对象本身——正文可能重复，不足以标识一条评论
    const [expanded, setExpanded] = useRecyclingState(false, [comment]);
    // 可见正文被 numberOfLines 限制后量不出真实行数，故用不限行的隐藏副本测量
    const [overflow, setOverflow] = useRecyclingState(false, [comment]);

    const date = comment.createdAt;
    const meta = [
        typeof date === 'number' && Number.isFinite(date)
            ? dayjs(date).format('YYYY-MM-DD')
            : '',
        comment.location ?? '',
    ]
        .filter(Boolean)
        .join(' · ');
    // 0 也是有效点赞数（插件明确返回 0 与未提供是两回事）
    const like = comment.like;
    const hasLike = typeof like === 'number' && Number.isFinite(like);

    return (
        <View style={styles.body}>
            {/* 作者身份挂在昵称这个文本元素上：包一层 View 加 accessible 会吞掉内部的展开按钮与点赞块 */}
            <Text
                size="sm"
                weight="medium"
                numberOfLines={1}
                accessibilityLabel={t(
                    isReply
                        ? 'musicComments.a11y.reply'
                        : 'musicComments.a11y.comment',
                    { nickName: comment.nickName },
                )}
            >
                {comment.nickName}
            </Text>
            {/* 隐藏测量：不限行拿真实行数，每次布局都重算（旋转 / 字号变化后按钮随之出现或消失） */}
            <View
                style={styles.measure}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
            >
                <Text
                    size="sm"
                    lineHeight="relaxed"
                    onTextLayout={e =>
                        setOverflow(
                            e.nativeEvent.lines.length > COLLAPSED_LINES,
                        )
                    }
                >
                    {comment.comment}
                </Text>
            </View>
            <Text
                size="sm"
                lineHeight="relaxed"
                numberOfLines={expanded ? undefined : COLLAPSED_LINES}
            >
                {comment.comment}
            </Text>
            {overflow ? (
                <Pressable
                    onPress={() => setExpanded(prev => !prev)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    style={styles.action}
                >
                    <Text size="sm" color="primary">
                        {t(
                            expanded
                                ? 'musicComments.collapse'
                                : 'musicComments.expand',
                        )}
                    </Text>
                </Pressable>
            ) : null}
            {meta || hasLike ? (
                <View style={styles.meta}>
                    <Text
                        size="xs"
                        color="textSecondary"
                        numberOfLines={1}
                        style={styles.metaText}
                    >
                        {meta}
                    </Text>
                    {hasLike ? (
                        // 只读展示：协议无点赞能力，故不是按钮
                        // 整块作单个无障碍元素，读屏报完整数字（而非紧凑写法）
                        <View
                            style={styles.like}
                            accessible
                            accessibilityLabel={t('musicComments.a11y.likes', {
                                count: like,
                            })}
                        >
                            <Icon
                                name="heart"
                                size={iconSize.xs}
                                color="textSecondary"
                            />
                            <Text size="xs" color="textSecondary">
                                {formatCount(like)}
                            </Text>
                        </View>
                    ) : null}
                </View>
            ) : null}
        </View>
    );
}

/**
 * 单条根评论：头像 + 正文，可展开其下回复（默认折叠）
 * 回复只平铺一层：更深层级由 normalizer 在边界裁掉，此处不再递归缩进
 */
export const CommentRow = memo(function CommentRowBase({
    comment,
    separated = false,
}: {
    comment: Comment;
    /** 底部补 hairline 分隔线：宽屏下行拉长、留白不足以分开相邻评论时开（手机默认关） */
    separated?: boolean;
}) {
    const colors = useColors();
    const t = useT();
    // 同上：行被复用给另一条评论时，回复展开态必须归零
    const [repliesOpen, setRepliesOpen] = useRecyclingState(false, [comment]);
    const replies = comment.replies ?? [];
    const shown = replies.slice(0, MAX_REPLIES);

    return (
        <View
            style={
                separated
                    ? [
                          styles.row,
                          styles.separated,
                          { borderBottomColor: colors.border },
                      ]
                    : styles.row
            }
        >
            <View style={styles.line}>
                <MediaCover
                    source={comment.avatar}
                    fallbackIcon="user-round"
                    round
                    size={AVATAR_SIZE}
                />
                <CommentBody comment={comment} />
            </View>
            {replies.length > 0 ? (
                <View style={styles.replies}>
                    <Pressable
                        onPress={() => setRepliesOpen(prev => !prev)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: repliesOpen }}
                        style={styles.action}
                    >
                        <Text size="sm" color="primary">
                            {t(
                                repliesOpen
                                    ? 'musicComments.hideReplies'
                                    : 'musicComments.showReplies',
                                { count: replies.length },
                            )}
                        </Text>
                    </Pressable>
                    {repliesOpen ? (
                        <View style={styles.replyList}>
                            {shown.map((reply, index) => (
                                // 回复无稳定唯一键（id 可缺、跨条可能重复）：并入位置兜底
                                <View
                                    key={`${
                                        reply.id ?? reply.nickName
                                    }-${index}`}
                                    style={styles.line}
                                >
                                    <MediaCover
                                        source={reply.avatar}
                                        fallbackIcon="user-round"
                                        round
                                        size={REPLY_AVATAR_SIZE}
                                    />
                                    <CommentBody comment={reply} isReply />
                                </View>
                            ))}
                            {replies.length > shown.length ? (
                                <Text size="xs" color="textSecondary">
                                    {t('musicComments.moreRepliesOmitted', {
                                        count: replies.length - shown.length,
                                    })}
                                </Text>
                            ) : null}
                        </View>
                    ) : null}
                </View>
            ) : null}
        </View>
    );
});

const styles = StyleSheet.create({
    row: {
        paddingHorizontal: layout.screenGutter,
        paddingVertical: space.md,
        gap: space.sm,
    },
    separated: {
        borderBottomWidth: borderWidth.hairline,
    },
    line: {
        flexDirection: 'row',
        gap: space.sm,
    },
    body: {
        flex: 1,
        gap: space.xs,
    },
    // 不占布局的测量副本：绝对定位 + 透明，仅用于拿未截断的真实行数
    measure: {
        position: 'absolute',
        left: 0,
        right: 0,
        opacity: 0,
    },
    action: {
        minHeight: layout.hitTarget,
        justifyContent: 'center',
    },
    meta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.sm,
    },
    metaText: {
        flex: 1,
    },
    like: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
    },
    // 回复整体缩进到根评论正文的左边缘（头像宽 + 间距）
    replies: {
        paddingLeft: AVATAR_SIZE + space.sm,
    },
    // 回复彼此留出呼吸区，避免上一条的时间行与下一条的昵称粘连
    replyList: {
        gap: space.lg,
        paddingBottom: space.xs,
    },
});
