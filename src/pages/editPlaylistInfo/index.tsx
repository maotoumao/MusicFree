import { useRoute, type RouteProp } from '@react-navigation/native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
} from 'react-native-reanimated';

import { AppBar } from '@/components/layout/AppBar';
import { ContentColumn } from '@/components/layout/ContentColumn';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { Section } from '@/components/ui/Section';
import { Text } from '@/components/ui/Text';
import {
    LOCAL_PLAYLIST_DESCRIPTION_MAX_LENGTH,
    LOCAL_PLAYLIST_TITLE_MAX_LENGTH,
} from '@/core/playlist';
import { borderWidth, layout, radius, space, useColors } from '@/design';
import { useBackAction } from '@/hooks/useBackAction';
import { useContentColumn } from '@/hooks/useContentColumn';
import { useT } from '@/i18n';

import { ArtworkField } from './components/ArtworkField';
import { useEditPlaylistDraft } from './hooks/useEditPlaylistDraft';

/** 本地歌单信息编辑页参数：目标歌单 id */
export interface EditPlaylistInfoParams {
    id: string;
}

/** 本地歌单信息编辑页：改名 / 简介 / 封面（草稿 + 底部保存 + 放弃确认） */
export default function EditPlaylistInfoScreen() {
    const t = useT();
    const colors = useColors();
    const back = useBackAction();
    // 平板：表单列限阅读宽（手机 undefined，contentContainerStyle 原样）
    const column = useContentColumn('reading');
    const route =
        useRoute<
            RouteProp<
                { EditPlaylistInfo: EditPlaylistInfoParams },
                'EditPlaylistInfo'
            >
        >();
    const draft = useEditPlaylistDraft(route.params.id);

    // 键盘弹起时把内容区底边抬到键盘上沿（edge-to-edge 下 window 不 resize，壳主动避让）：
    // footer 常驻底部随内容整体上移、不遮挡输入（Screen 底部安全区叠在其下，键盘时留出呼吸）
    const keyboardHeight = useSharedValue(0);
    useKeyboardHandler(
        {
            onMove: e => {
                'worklet';
                keyboardHeight.value = e.height;
            },
            onEnd: e => {
                'worklet';
                keyboardHeight.value = e.height;
            },
        },
        [],
    );
    const keyboardAvoidStyle = useAnimatedStyle(() => ({
        paddingBottom: keyboardHeight.value,
    }));

    // 基线就绪前（含 detail 尚未加载）显示 Loading，避免空草稿闪现
    if (!draft.detail || !draft.draftReady) {
        return (
            <Screen edges={['bottom']}>
                <AppBar
                    title={t('editPlaylistInfo.title')}
                    leading={back}
                    contentWidth="reading"
                />
                <Loading variant="fullscreen" />
            </Screen>
        );
    }

    const inputsDisabled = draft.degraded;

    return (
        <Screen edges={['bottom']}>
            <AppBar
                title={t('editPlaylistInfo.title')}
                leading={back}
                contentWidth="reading"
            />
            <Animated.View style={[styles.body, keyboardAvoidStyle]}>
                <PaperPane width="reading">
                    <ScrollView
                        contentContainerStyle={
                            column ? [styles.content, column] : styles.content
                        }
                    >
                        {draft.degraded ? (
                            <View
                                style={[
                                    styles.banner,
                                    { backgroundColor: colors.warningSoft },
                                ]}
                            >
                                <Icon
                                    name="triangle-alert"
                                    size="sm"
                                    color="warning"
                                />
                                <Text size="sm" style={styles.bannerText}>
                                    {t('editPlaylistInfo.storageReadOnly')}
                                </Text>
                            </View>
                        ) : null}
                        <Section title={t('editPlaylistInfo.artwork')}>
                            <ArtworkField
                                previewUri={draft.artworkPreviewUri}
                                fallbackIcon={
                                    draft.isFavorite ? 'heart' : 'list-music'
                                }
                                state={draft.artworkState}
                                canRestoreAuto={draft.canRestoreAuto}
                                disabled={inputsDisabled}
                                onChangeArtwork={draft.changeArtwork}
                                onRestoreAuto={draft.restoreAutoArtwork}
                            />
                        </Section>
                        <Section title={t('editPlaylistInfo.name')}>
                            <View style={styles.field}>
                                <Input
                                    value={
                                        draft.isFavorite
                                            ? t('media.favoritePlaylist')
                                            : draft.title
                                    }
                                    onChangeText={draft.setTitle}
                                    accessibilityLabel={t(
                                        'editPlaylistInfo.name',
                                    )}
                                    maxLength={LOCAL_PLAYLIST_TITLE_MAX_LENGTH}
                                    disabled={
                                        draft.isFavorite || inputsDisabled
                                    }
                                />
                                {draft.isFavorite ? (
                                    <Text
                                        size="sm"
                                        color="textSecondary"
                                        style={styles.hint}
                                    >
                                        {t('editPlaylistInfo.favoriteNameHint')}
                                    </Text>
                                ) : draft.titleError ? (
                                    <Text
                                        size="sm"
                                        color="danger"
                                        style={styles.hint}
                                        accessibilityLiveRegion="polite"
                                    >
                                        {t('editPlaylistInfo.nameRequired')}
                                    </Text>
                                ) : null}
                            </View>
                        </Section>
                        <Section title={t('editPlaylistInfo.description')}>
                            <View style={styles.field}>
                                <Input
                                    value={draft.description}
                                    onChangeText={draft.setDescription}
                                    accessibilityLabel={t(
                                        'editPlaylistInfo.description',
                                    )}
                                    placeholder={t(
                                        'editPlaylistInfo.descriptionPlaceholder',
                                    )}
                                    multiline
                                    minRows={3}
                                    maxRows={5}
                                    maxLength={
                                        LOCAL_PLAYLIST_DESCRIPTION_MAX_LENGTH
                                    }
                                    disabled={inputsDisabled}
                                />
                            </View>
                        </Section>
                    </ScrollView>
                </PaperPane>
                <View
                    style={[
                        styles.footer,
                        {
                            borderTopColor: colors.border,
                            backgroundColor: colors.surface,
                        },
                    ]}
                >
                    {/* 保存条通栏铺色，按钮本体与表单同宽（平板）；手机 ContentColumn 原样返回 */}
                    <ContentColumn kind="reading">
                        <Button
                            variant="filled"
                            tone="primary"
                            size="lg"
                            disabled={!draft.canSave}
                            onPress={draft.save}
                        >
                            {t('editPlaylistInfo.saveChanges')}
                        </Button>
                    </ContentColumn>
                </View>
            </Animated.View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    body: {
        flex: 1,
    },
    content: {
        // 手机横屏沿用旧的 640 限宽居中；平板由 useContentColumn 覆盖为 reading 列
        width: '100%',
        maxWidth: layout.listContentMaxWidth,
        alignSelf: 'center',
        paddingVertical: space.md,
        gap: space.xl,
    },
    field: {
        paddingHorizontal: space.lg,
    },
    hint: {
        marginTop: space.xs,
    },
    footer: {
        padding: space.lg,
        borderTopWidth: borderWidth.hairline,
    },
    banner: {
        flexDirection: 'row',
        gap: space.sm,
        alignItems: 'flex-start',
        marginHorizontal: space.lg,
        padding: space.md,
        borderRadius: radius.md,
    },
    bannerText: {
        flex: 1,
    },
});
