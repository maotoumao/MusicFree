import { useRoute, type RouteProp } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBar } from '@/components/layout/AppBar';
import { Screen } from '@/components/layout/Screen';
import { ContentUnavailable } from '@/components/ui/ContentUnavailable';
import { Tabs } from '@/components/ui/Tabs';
import { borderWidth, radius, space, useColors } from '@/design';
import { useBackAction } from '@/hooks/useBackAction';
import { useT } from '@/i18n';

import { BackgroundControls } from './components/BackgroundControls';
import { BackgroundStage } from './components/BackgroundStage';
import { ColorControls } from './components/ColorControls';
import { ThemePreviewSample } from './components/ThemePreviewSample';
import { useBackgroundEditor } from './hooks/useBackgroundEditor';
import {
    resolveSourceUri,
    useEditedThemePack,
} from './hooks/useEditedThemePack';

import type { BackgroundShape } from './hooks/useBackgroundEditor';

/** 编辑目标主题；只接 id，内容从 core 订阅 */
interface ThemeEditorParams {
    packId: string;
}

type EditorTab = 'background' | 'color';

/**
 * 面板高度占屏比：定高而非随内容伸缩
 * 切页签、选完图、控件增减都不该让面板上下跳——预览区跟着变高变矮尤其晃眼；
 * 内容多了就在面板内滚动
 */
const PANEL_HEIGHT_RATIO = 0.5;
/** 面板高度封顶（dp）：控件就那么多，大屏上再按比例摊只是白占预览区 */
const PANEL_MAX_HEIGHT = 420;

/**
 * 主题编辑器：整屏坐在正在编辑的背景上，上半是压着样张的预览区，下半是控制面板
 *
 * 编辑器把该主题投影为全局主题，故自己的顶栏、面板与滑块就是这套主题的真实样张；
 * 所有改动即时生效、可随时切回其他主题，没有保存与放弃两态。
 */
function ThemeEditorScreen() {
    const t = useT();
    const colors = useColors();
    const back = useBackAction();
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const { packId } =
        useRoute<RouteProp<{ ThemeEditor: ThemeEditorParams }, 'ThemeEditor'>>()
            .params;
    const pack = useEditedThemePack(packId);
    const editor = useBackgroundEditor(pack);
    // 先解构：exhaustive-deps 不接受成员表达式作依赖，而 editor 对象每次渲染都换新引用
    const { busy, reshape: commitReshape, settledCommits } = editor;
    const [tab, setTab] = useState<EditorTab>('background');

    const background = pack?.background ?? null;
    // 手势与滑块的实时通道：拖动期间直写 UI 线程，松手才提交给 core
    const liveScale = useSharedValue(background?.scale ?? 1);
    const liveVeil = useSharedValue(1 - (background?.visibility ?? 0));
    // 进行中的交互计数：> 0 才盖预览层；静止时让位给真背景，所见即最终
    const activeInteractions = useSharedValue(0);
    // 手势在 UI 线程结束，busy 却要绕一圈 JS 才为真；中间这一两帧靠它接住，
    // 否则预览层会先撤、露出还没被替换掉的旧位图
    const pendingCommit = useSharedValue(0);
    // 烘焙期间不回灌：位图未落库前 core 里还是旧形状，同步过来预览会闪一下
    useEffect(() => {
        if (busy) {
            return;
        }
        liveScale.value = background?.scale ?? 1;
        liveVeil.value = 1 - (background?.visibility ?? 0);
    }, [background, busy, liveScale, liveVeil]);

    /** 交接的收口：没真的入队就立刻把接力标记放掉，免得预览层一直盖着 */
    const reshape = useCallback(
        (shape: BackgroundShape) => {
            if (!commitReshape(shape)) {
                pendingCommit.value = 0;
            }
        },
        [commitReshape, pendingCommit],
    );
    // 只取用到的两个标量做依赖：整个 background 对象每次提交都换新引用，
    // 会让手势 config 跟着重建、每渲染向原生重下发一次
    const committedBlur = background?.blurRadius;
    const committedScale = background?.scale;
    const onMoveEnd = useCallback(
        (focusX: number, focusY: number) => {
            if (committedBlur === undefined || committedScale === undefined) {
                pendingCommit.value = 0;
                return;
            }
            reshape({
                blurRadius: committedBlur,
                focusX,
                focusY,
                scale: committedScale,
            });
        },
        [committedBlur, committedScale, pendingCommit, reshape],
    );
    // 每结算一轮提交就放掉接力标记；用单调计数而非 busy 布尔，
    // 免得某次提交在同一个 React 批次里走完 true→false、依赖不变而漏掉释放
    useEffect(() => {
        pendingCommit.value = 0;
    }, [settledCommits, pendingCommit]);

    if (!pack) {
        return (
            <Screen edges={['bottom']}>
                <AppBar title={t('themeEditor.title')} leading={back} />
                <ContentUnavailable
                    icon="palette"
                    title={t('feedback.loadFailed')}
                />
            </Screen>
        );
    }

    return (
        <Screen edges={[]}>
            {/* 预览层铺满整屏并压在最底：面板与顶栏都半透明地坐在它上面 */}
            <BackgroundStage
                sourceUri={resolveSourceUri(pack)}
                shape={{
                    blurRadius: background?.blurRadius ?? 0,
                    focusX: background?.focusX ?? 0.5,
                    focusY: background?.focusY ?? 0.5,
                    scale: background?.scale ?? 1,
                }}
                liveScale={liveScale}
                liveVeil={liveVeil}
                activeInteractions={activeInteractions}
                pendingCommit={pendingCommit}
                onMoveEnd={onMoveEnd}
                busy={busy}
            />
            <AppBar
                title={pack.name || t('themeEditor.title')}
                leading={back}
            />
            <View style={styles.stage} pointerEvents="box-none">
                <ThemePreviewSample />
            </View>
            <View
                style={[
                    styles.panel,
                    {
                        height: Math.min(
                            windowHeight * PANEL_HEIGHT_RATIO,
                            PANEL_MAX_HEIGHT,
                        ),
                        paddingBottom: insets.bottom,
                        backgroundColor: colors.surface,
                        borderTopColor: colors.border,
                    },
                ]}
            >
                <Tabs
                    items={[
                        {
                            key: 'background' as const,
                            label: t('themeEditor.tab.background'),
                        },
                        {
                            key: 'color' as const,
                            label: t('themeEditor.tab.color'),
                        },
                    ]}
                    value={tab}
                    onChange={setTab}
                />
                <ScrollView
                    style={styles.panelScroll}
                    keyboardShouldPersistTaps="handled"
                >
                    {tab === 'background' ? (
                        <BackgroundControls
                            background={background}
                            busy={busy}
                            liveScale={liveScale}
                            liveVeil={liveVeil}
                            activeInteractions={activeInteractions}
                            pendingCommit={pendingCommit}
                            onPick={editor.pick}
                            onRemove={editor.remove}
                            onReshape={reshape}
                            onLayers={editor.setLayers}
                        />
                    ) : (
                        <ColorControls pack={pack} />
                    )}
                </ScrollView>
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    /** 样品陈列区：面板高度固定，这块空档恒定，居中不会随切 tab / 选图上下跳 */
    stage: {
        flex: 1,
        justifyContent: 'center',
        paddingVertical: space.lg,
    },
    panel: {
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        borderTopWidth: borderWidth.hairline,
        overflow: 'hidden',
    },
    /** 吃掉 Tabs 之外的剩余高度，内容再多也只在这里滚 */
    panelScroll: {
        flex: 1,
    },
});

export default ThemeEditorScreen;
export type { ThemeEditorParams };
