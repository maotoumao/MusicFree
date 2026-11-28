import {
    useNavigation,
    usePreventRemove,
    useRoute,
    type RouteProp,
} from '@react-navigation/native';
import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppBar } from '@/components/layout/AppBar';
import { ContentColumn } from '@/components/layout/ContentColumn';
import { PaperPane } from '@/components/layout/PaperPane';
import { Screen } from '@/components/layout/Screen';
import { showToast } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { borderWidth, space, useColors } from '@/design';
import { useBackAction } from '@/hooks/useBackAction';
import { useContentColumn } from '@/hooks/useContentColumn';
import { useT } from '@/i18n';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import { ExcludedDirSection } from './components/ExcludedDirSection';
import { MusicFilterSection } from './components/MusicFilterSection';
import { ScanScopeSection } from './components/ScanScopeSection';
import { useDraftScanSettings } from './hooks/useDraftScanSettings';

import type { ScanDirTarget } from './hooks/useDraftScanSettings';

/** 管理扫描范围页路由参数：目录浏览器回传的选中目录（仅回跳时带） */
export type ScanSettingsParams =
    | { pickedDir?: string; pickedTarget?: ScanDirTarget }
    | undefined;

/**
 * 管理扫描范围页：音乐过滤 + 扫描范围 + 排除目录三区块，底部常驻「保存」
 * 编辑只进 draft；添加目录跳目录浏览器、经导航回传选中路径；保存落库后返回控制台（扫描发起统一在控制台）
 */
export default function ScanSettingsScreen() {
    const t = useT();
    const colors = useColors();
    const back = useBackAction();
    const navigation = useNavigation();
    const route =
        useRoute<
            RouteProp<{ ScanSettings: ScanSettingsParams }, 'ScanSettings'>
        >();

    const {
        draft,
        setMode,
        setShortAudioFilter,
        setMinSizeBytes,
        addDir,
        removeDir,
        conflictDirs,
        hasChanges,
        saveSettings,
    } = useDraftScanSettings();

    // 保存的主动离开：放行标记（落库后 hasChanges 仍真，避免被放弃确认误拦）
    const applyingRef = useRef(false);

    // 消费目录浏览器回传：选中目录加进 draft，随后清 param 防重复触发
    const pickedDir = route.params?.pickedDir;
    const pickedTarget = route.params?.pickedTarget;
    useEffect(() => {
        if (pickedDir !== undefined && pickedTarget !== undefined) {
            addDir(pickedTarget, pickedDir);
            navigation.setParams({
                pickedDir: undefined,
                pickedTarget: undefined,
            });
        }
    }, [pickedDir, pickedTarget, addDir, navigation]);

    const openBrowser = useCallback(
        (target: ScanDirTarget) => {
            navigation.navigate('DirectoryBrowser', {
                purpose:
                    target === 'included' ? 'scanIncluded' : 'scanExcluded',
            });
        },
        [navigation],
    );

    // 保存：冲突先拦截 → 放行标记 + 落库 draft → 返回控制台（扫描由控制台发起）
    const save = useCallback(() => {
        const conflict = conflictDirs[0];
        if (conflict !== undefined) {
            showToast(t('scanSettings.conflict', { name: conflict }), {
                type: 'info',
            });
            return;
        }
        applyingRef.current = true;
        saveSettings();
        navigation.goBack();
    }, [conflictDirs, saveSettings, navigation, t]);

    // 拦截一切返回（AppBar / 硬件返回 / 侧滑 / 父级移除）：有未应用改动先二次确认；开始扫描的离开直接放行
    usePreventRemove(hasChanges, ({ data }) => {
        if (applyingRef.current) {
            navigation.dispatch(data.action);
            return;
        }
        showConfirmDialog({
            title: t('scanSettings.discardConfirm.title'),
            message: t('scanSettings.discardConfirm.message'),
            danger: true,
        })
            .then(ok => {
                if (ok) {
                    navigation.dispatch(data.action);
                }
            })
            .catch(() => {});
    });

    // 指定模式但一个扫描目录都没加：配置无效，保存置灰（加目录走扫描范围区的「添加扫描目录」）
    // 平板：表单列限阅读宽（手机 undefined，contentContainerStyle 原样）
    const column = useContentColumn('reading');
    const customWithoutDirs =
        draft.mode === 'custom' && draft.includedDirs.length === 0;

    return (
        <Screen edges={['bottom']}>
            <AppBar
                title={t('scanSettings.title')}
                leading={back}
                contentWidth="reading"
            />
            <PaperPane width="reading">
                <ScrollView
                    contentContainerStyle={
                        column ? [styles.content, column] : styles.content
                    }
                >
                    <MusicFilterSection
                        draft={draft}
                        onSetShortAudio={setShortAudioFilter}
                        onSetMinSize={setMinSizeBytes}
                    />
                    <ScanScopeSection
                        draft={draft}
                        onSetMode={setMode}
                        onAddDir={() => openBrowser('included')}
                        onRemoveDir={p => removeDir('included', p)}
                    />
                    <ExcludedDirSection
                        draft={draft}
                        onAddDir={() => openBrowser('excluded')}
                        onRemoveDir={p => removeDir('excluded', p)}
                    />
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
                    <Button onPress={save} disabled={customWithoutDirs}>
                        {t('common.save')}
                    </Button>
                </ContentColumn>
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingVertical: space.md,
        gap: space.lg,
    },
    footer: {
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderTopWidth: borderWidth.hairline,
    },
});
