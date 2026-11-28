import { useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { defineDialog } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Text } from '@/components/ui/Text';
import { layout, space } from '@/design';
import { isCompactHeight } from '@/hooks/useCompactHeight';
import { useT } from '@/i18n';

import type { OverlayProps } from '@/components/overlay';
import type { AppRelease } from '@/core/appUpdate';

export interface AppUpdateDialogOptions {
    release: AppRelease;
    initialSkipVersion?: boolean;
    onSkipVersionChange?: (skip: boolean) => void;
}

export type AppUpdateDialogAction = 'download' | 'otherDownloads';

/** 应用更新弹窗：长说明只滚动正文，版本跳过状态实时回传给调用方 */
function AppUpdateDialogView({
    payload,
    close,
}: OverlayProps<AppUpdateDialogOptions, AppUpdateDialogAction>) {
    const t = useT();
    const { height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const [skipVersion, setSkipVersion] = useState(
        payload.initialSkipVersion ?? false,
    );
    const { release } = payload;
    const hasDownload = release.downloadUrls.length > 0;
    const hasOtherDownloads = release.downloadUrls.length > 1;
    // 与 chrome 矮档、内容列取消限宽同一个判据，别再就地写字面量
    const isCompact = isCompactHeight(height);
    const contentMaxHeight = Math.max(
        0,
        height - insets.top - insets.bottom - space.xl * 4,
    );
    const changelogMaxHeight = Math.min(320, height * 0.4);

    const toggleSkipVersion = () => {
        const next = !skipVersion;
        setSkipVersion(next);
        payload.onSkipVersionChange?.(next);
    };

    return (
        <View style={{ maxHeight: contentMaxHeight }}>
            <Text
                size="xl"
                weight="bold"
                lineHeight="tight"
                numberOfLines={isCompact ? 1 : undefined}
                ellipsizeMode={isCompact ? 'middle' : undefined}
            >
                {t('appUpdateDialog.title', {
                    version: release.version,
                })}
            </Text>
            <ScrollView
                style={[
                    styles.changelogViewport,
                    isCompact ? styles.changelogViewportCompact : null,
                    { maxHeight: changelogMaxHeight },
                ]}
                contentContainerStyle={styles.changelog}
                nestedScrollEnabled
                showsVerticalScrollIndicator
            >
                {release.changeLog.length > 0 ? (
                    release.changeLog.map((line, index) => (
                        <Text
                            key={`${index}-${line}`}
                            color="textSecondary"
                            lineHeight="normal"
                        >
                            {line}
                        </Text>
                    ))
                ) : (
                    <Text color="textSecondary" lineHeight="normal">
                        {t('appUpdateDialog.noDetails')}
                    </Text>
                )}
            </ScrollView>
            <Pressable
                onPress={toggleSkipVersion}
                style={[
                    styles.skipRow,
                    isCompact ? styles.skipRowCompact : null,
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: skipVersion }}
                accessibilityLabel={t('appUpdateDialog.skipVersion')}
            >
                <Checkbox checked={skipVersion} />
                <Text style={styles.skipLabel}>
                    {t('appUpdateDialog.skipVersion')}
                </Text>
            </Pressable>
            <View
                style={[
                    styles.actions,
                    isCompact ? styles.actionsCompact : null,
                ]}
            >
                {hasOtherDownloads ? (
                    <Button
                        size={isCompact ? 'sm' : 'md'}
                        variant="ghost"
                        tone="neutral"
                        onPress={() => close('otherDownloads')}
                    >
                        {t('appUpdateDialog.otherDownloads')}
                    </Button>
                ) : null}
                {hasDownload ? (
                    <Button
                        size={isCompact ? 'sm' : 'md'}
                        onPress={() => close('download')}
                    >
                        {t('common.download')}
                    </Button>
                ) : null}
            </View>
        </View>
    );
}

export const showAppUpdateDialog = defineDialog(AppUpdateDialogView);

const styles = StyleSheet.create({
    changelogViewport: {
        minHeight: 0,
        flexShrink: 1,
        marginTop: space.md,
    },
    changelogViewportCompact: {
        marginTop: space.sm,
    },
    changelog: {
        gap: space.sm,
    },
    skipRow: {
        minHeight: layout.hitTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        marginTop: space.md,
    },
    skipRowCompact: {
        marginTop: space.xs,
    },
    skipLabel: {
        flex: 1,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
        gap: space.sm,
        marginTop: space.lg,
    },
    actionsCompact: {
        marginTop: space.sm,
    },
});
