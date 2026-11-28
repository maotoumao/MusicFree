import { useRoute, type RouteProp } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBar } from '@/components/layout/AppBar';
import { ContentColumn } from '@/components/layout/ContentColumn';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Loading } from '@/components/ui/Loading';
import { Text } from '@/components/ui/Text';
import { layout, space } from '@/design';
import { useBackAction } from '@/hooks/useBackAction';
import { useLayoutClass } from '@/hooks/useLayoutClass';
import { useT } from '@/i18n';
import { claim } from '@/infra/stash';

import { CommentRow } from './components/CommentRow';
import { CommentsHeader } from './components/CommentsHeader';
import { useMusicComments } from './hooks/useMusicComments';

import type { Comment, MusicItem } from '@/types';

/** 评论页路由参数：仅 stash 取件号（MusicItem 含插件私有字段、不可靠序列化） */
export interface MusicCommentsParams {
    ticket: string;
}

/**
 * 评论无稳定唯一键（id 可缺、跨页可能重复）：一律并入位置兜底
 * 列表只追加不重排，index 因而稳定
 */
const keyExtractor = (comment: Comment, index: number) =>
    `${comment.id ?? comment.nickName}-${index}`;

/** 歌曲评论页：只读展示插件返回的评论，触底分页 */
export default function MusicCommentsScreen() {
    const t = useT();
    const back = useBackAction();
    const insets = useSafeAreaInsets();
    const { ticket } =
        useRoute<
            RouteProp<{ MusicComments: MusicCommentsParams }, 'MusicComments'>
        >().params;

    // claim 破坏性（读即删）：放提交后的 effect 做、渲染期保持纯净
    const [claimed, setClaimed] = useState<{
        ticket: string;
        item: MusicItem | undefined;
    }>();
    useEffect(() => {
        setClaimed({ ticket, item: claim<MusicItem>(ticket) });
    }, [ticket]);
    const item = claimed?.ticket === ticket ? claimed.item : undefined;

    const {
        comments,
        isLoading,
        isError,
        unsupported,
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
        retry,
    } = useMusicComments(item);

    // 平板：正文列限阅读宽（评论是散文，取 680 而非媒体行的 840）；宽屏下相邻评论边界会模糊，补分隔线。
    // 手机：ContentColumn 原样返回、separated=false，与今天一致
    const layoutClass = useLayoutClass();
    const separated = layoutClass !== 'phone';
    const renderItem = useCallback(
        ({ item: comment }: { item: Comment }) => (
            <ContentColumn kind="reading">
                <CommentRow comment={comment} separated={separated} />
            </ContentColumn>
        ),
        [separated],
    );

    // 页尾：加载更多 / 重试 / 到底；无数据时不占位（空态自己表达）
    const footer =
        comments.length === 0 ? null : (
            <View style={styles.footer}>
                {isFetchingNextPage ? (
                    <Loading />
                ) : isFetchNextPageError ? (
                    <Button variant="ghost" size="sm" onPress={fetchNextPage}>
                        {t('common.retry')}
                    </Button>
                ) : hasNextPage ? null : (
                    <Text size="xs" color="textSecondary">
                        {t('musicComments.end')}
                    </Text>
                )}
            </View>
        );

    const body = () => {
        // ticket 失效（进程重启后重放路由等）：无从取回曲目
        if (claimed && !item) {
            return (
                <ContentUnavailable
                    icon="triangle-alert"
                    title={t('feedback.loadFailed')}
                />
            );
        }
        if (!item || isLoading) {
            return <Loading variant="fullscreen" />;
        }
        if (unsupported) {
            return (
                <ContentUnavailable
                    icon="message-circle"
                    title={t('musicComments.unsupported')}
                    description={t('musicComments.unsupportedDesc')}
                />
            );
        }
        if (isError) {
            return (
                <ContentUnavailable
                    icon="triangle-alert"
                    title={t('musicComments.loadFailed')}
                    action={{ label: t('common.retry'), onPress: retry }}
                />
            );
        }
        if (comments.length === 0) {
            return (
                <ContentUnavailable
                    icon="message-circle"
                    title={t('musicComments.empty')}
                    description={t('musicComments.emptyDesc')}
                />
            );
        }
        return (
            <FlashList
                data={comments as Comment[]}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                ListFooterComponent={footer}
                onEndReachedThreshold={0.3}
                onEndReached={() => {
                    // 翻页失败后不再自动重发：交给页尾重试按钮，否则滚动会持续打空炮
                    if (
                        hasNextPage &&
                        !isFetchingNextPage &&
                        !isFetchNextPageError
                    ) {
                        fetchNextPage();
                    }
                }}
                contentContainerStyle={{ paddingBottom: insets.bottom }}
            />
        );
    };

    return (
        // edges 不含 top：AppBar 自承接顶部安全区，页面再消费会得到双份留白
        // bottom 也不消费：列表用 contentContainer padding 让出，滚动内容可延伸到底
        <Screen edges={[]}>
            <AppBar
                title={t('musicComments.title')}
                leading={back}
                contentWidth="reading"
            />
            <PaperPane width="reading">
                {item ? (
                    <ContentColumn kind="reading">
                        <CommentsHeader item={item} />
                    </ContentColumn>
                ) : null}
                <View style={styles.body}>{body()}</View>
            </PaperPane>
        </Screen>
    );
}

const styles = StyleSheet.create({
    body: {
        flex: 1,
    },
    footer: {
        minHeight: layout.hitTarget,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: space.md,
    },
});
