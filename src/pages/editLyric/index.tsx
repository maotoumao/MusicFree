import { useRoute, type RouteProp } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Loading } from '@/components/ui/Loading';
import { Tabs } from '@/components/ui/Tabs';
import { Text } from '@/components/ui/Text';
import { LYRIC_MAX_LENGTH } from '@/core/lyric';
import { borderWidth, layout, space, useColors } from '@/design';
import { useBackAction } from '@/hooks/useBackAction';
import { useContentColumn } from '@/hooks/useContentColumn';
import { useT } from '@/i18n';
import { claim } from '@/infra/stash';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';

import { LyricCanvas } from './components/LyricCanvas';
import { ParseStatusBar } from './components/ParseStatusBar';
import { useEditLyricDraft } from './hooks/useEditLyricDraft';
import { useParseStatus } from './hooks/useParseStatus';

import type { LyricCanvasHandle } from './components/LyricCanvas';
import type { MusicItem } from '@/types';
import type { ActionSheetItem } from '@/widgets/overlays/ActionSheetPanel';

/** 歌词编辑页路由参数：仅 stash 取件号（MusicItem 含插件私有字段、不可靠序列化） */
export interface EditLyricParams {
    ticket: string;
}

/** 歌词编辑页：为任意一首歌手工提供 / 修改歌词文本（不含打轴与时间偏移） */
export default function EditLyricScreen() {
    const t = useT();
    const colors = useColors();
    const back = useBackAction();
    // 平板：编辑列限阅读宽；header / 画布容器自带 16 内距，只补差额（手机 undefined、样式原样）
    const column = useContentColumn('reading');
    const { ticket } =
        useRoute<RouteProp<{ EditLyric: EditLyricParams }, 'EditLyric'>>()
            .params;

    // claim 破坏性（读即删）：放提交后的 effect 做、渲染期保持纯净
    const [claimed, setClaimed] = useState<{
        ticket: string;
        item: MusicItem | undefined;
    }>();
    useEffect(() => {
        setClaimed({ ticket, item: claim<MusicItem>(ticket) });
    }, [ticket]);
    const target = claimed?.ticket === ticket ? claimed.item : undefined;

    const draft = useEditLyricDraft(target);
    const status = useParseStatus({
        segment: draft.segment,
        lyric: draft.lyricText,
        translation: draft.translationText,
        hasCustomLyric: draft.hasCustomLyric,
    });

    // 「添加译文」要键盘不落、焦点直接进译文画布；隐藏那段的原生实例还在，得显式交接
    const translationCanvasRef = useRef<LyricCanvasHandle>(null);
    const { hasTranslation, segment } = draft;
    useEffect(() => {
        if (hasTranslation && segment === 'translation') {
            translationCanvasRef.current?.focus();
        }
    }, [hasTranslation, segment]);

    // 键盘弹起时把内容区底边抬到键盘上沿：状态条与保存条停在键盘上方，编辑画布被压缩
    // 长文本编辑常常整段时间不收键盘，被遮住的保存条等于不存在
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

    const openMenu = () => {
        const items: ActionSheetItem[] = [
            draft.hasTranslation && draft.segment === 'translation'
                ? {
                      icon: 'languages',
                      label: t('editLyric.removeTranslation'),
                      danger: true,
                      onPress: draft.removeTranslation,
                  }
                : {
                      icon: 'languages',
                      label: t('editLyric.addTranslation'),
                      onPress: draft.addTranslation,
                  },
            {
                icon: 'import',
                label: t('editLyric.importFile'),
                onPress: draft.importFromFile,
            },
        ];
        // 不提供不产生任何效果的操作：没存过自定义词就没有「默认」可恢复
        if (draft.hasCustomLyric) {
            items.push({
                icon: 'refresh-cw',
                label: t('editLyric.restoreDefault'),
                onPress: draft.restoreDefault,
            });
        }
        showActionSheetPanel({ items });
    };

    const title = t('editLyric.title');
    // claim 是破坏性读：票据没兑到（冷启动恢复导航栈等）就不该干等，直说打不开
    if (claimed && !target) {
        return (
            <Screen edges={['bottom']}>
                <AppBar title={title} leading={back} contentWidth="reading" />
                <ContentUnavailable
                    icon="triangle-alert"
                    title={t('feedback.loadFailed')}
                />
            </Screen>
        );
    }
    if (!draft.ready) {
        return (
            <Screen edges={['bottom']}>
                <AppBar title={title} leading={back} contentWidth="reading" />
                <Loading variant="fullscreen" />
            </Screen>
        );
    }

    const subtitle = [target?.title, target?.artist]
        .filter(Boolean)
        .join(' · ');

    return (
        <Screen edges={['bottom']}>
            <AppBar
                title={title}
                leading={back}
                contentWidth="reading"
                overflow={{
                    onPress: openMenu,
                    label: t('editLyric.a11y.more'),
                }}
            />
            <Animated.View style={[styles.body, keyboardAvoidStyle]}>
                <PaperPane width="reading">
                    <View
                        style={column ? [styles.header, column] : styles.header}
                    >
                        {/* 从歌曲行进来时，这是确认「在改哪一首」的唯一线索，不是装饰 */}
                        <Text size="sm" color="textSecondary" numberOfLines={1}>
                            {subtitle}
                        </Text>
                        {draft.hasTranslation ? (
                            <Tabs
                                align="start"
                                value={draft.segment}
                                onChange={draft.setSegment}
                                items={[
                                    {
                                        key: 'lyric' as const,
                                        label: t('editLyric.lyricTab'),
                                    },
                                    {
                                        key: 'translation' as const,
                                        label: t('editLyric.translationTab'),
                                    },
                                ]}
                            />
                        ) : null}
                    </View>
                    {/* 两段各自常驻、以显隐切换：重挂会丢掉光标与滚动位置 */}
                    <View
                        accessibilityElementsHidden={draft.segment !== 'lyric'}
                        importantForAccessibility={
                            draft.segment === 'lyric'
                                ? 'auto'
                                : 'no-hide-descendants'
                        }
                        style={
                            draft.segment === 'lyric'
                                ? column
                                    ? [styles.pane, column]
                                    : styles.pane
                                : styles.hidden
                        }
                    >
                        <LyricCanvas
                            key={`lyric-${draft.lyricRevision}`}
                            defaultValue={draft.lyricInitial}
                            onChangeText={draft.onChangeLyric}
                            maxLength={LYRIC_MAX_LENGTH}
                            accessibilityLabel={t('editLyric.a11y.editor')}
                            onImport={draft.importFromFile}
                        />
                    </View>
                    {draft.hasTranslation ? (
                        <View
                            accessibilityElementsHidden={
                                draft.segment !== 'translation'
                            }
                            importantForAccessibility={
                                draft.segment === 'translation'
                                    ? 'auto'
                                    : 'no-hide-descendants'
                            }
                            style={
                                draft.segment === 'translation'
                                    ? column
                                        ? [styles.pane, column]
                                        : styles.pane
                                    : styles.hidden
                            }
                        >
                            <LyricCanvas
                                ref={translationCanvasRef}
                                key={`translation-${draft.translationRevision}`}
                                defaultValue={draft.translationInitial}
                                onChangeText={draft.onChangeTranslation}
                                maxLength={LYRIC_MAX_LENGTH}
                                accessibilityLabel={t(
                                    'editLyric.a11y.translationEditor',
                                )}
                                placeholder={t(
                                    'editLyric.translationPlaceholder',
                                )}
                            />
                        </View>
                    ) : null}
                </PaperPane>
                <ParseStatusBar status={status} />
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
                            {t('common.save')}
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
    header: {
        width: '100%',
        maxWidth: layout.listContentMaxWidth,
        alignSelf: 'center',
        paddingHorizontal: layout.screenGutter,
        paddingTop: space.md,
        gap: space.sm,
    },
    pane: {
        flex: 1,
        width: '100%',
        maxWidth: layout.listContentMaxWidth,
        alignSelf: 'center',
        paddingTop: space.md,
    },
    hidden: {
        display: 'none',
    },
    footer: {
        padding: space.lg,
        borderTopWidth: borderWidth.hairline,
    },
});
