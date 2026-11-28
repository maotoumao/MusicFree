import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { MediaCover } from '@/components/ui/MediaCover';
import { Text } from '@/components/ui/Text';
import { radius, space } from '@/design';
import { useT, type PlainKey } from '@/i18n';

import type { ArtworkState } from '../hooks/useEditPlaylistDraft';
import type { IconName } from '@/components/ui/icons.generated';

const ARTWORK_SIZE = 128;

// 呈现态 → 状态说明文案
const STATUS_TEXT = {
    custom: 'editPlaylistInfo.customArtwork',
    auto: 'editPlaylistInfo.autoArtwork',
    pendingImage: 'editPlaylistInfo.pendingArtwork',
    pendingAuto: 'editPlaylistInfo.pendingAutoArtwork',
} as const satisfies Record<ArtworkState, PlainKey>;

interface ArtworkFieldProps {
    /** 预览 uri；undefined = 回退占位图标 */
    previewUri: string | undefined;
    /** 无图 / 加载失败的兜底图标（favorite = heart、普通歌单 = list-music） */
    fallbackIcon: IconName;
    state: ArtworkState;
    canRestoreAuto: boolean;
    disabled: boolean;
    onChangeArtwork: () => void;
    onRestoreAuto: () => void;
}

/** 封面编辑区：128 方图预览（持久 / 待保存四态）+ 状态说明 + 更换 / 恢复自动封面动作 */
export function ArtworkField({
    previewUri,
    fallbackIcon,
    state,
    canRestoreAuto,
    disabled,
    onChangeArtwork,
    onRestoreAuto,
}: ArtworkFieldProps) {
    const t = useT();
    return (
        <View style={styles.field}>
            <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={
                    previewUri
                        ? t('editPlaylistInfo.a11y.artwork')
                        : t('editPlaylistInfo.a11y.artworkEmpty')
                }
            >
                <MediaCover
                    source={previewUri}
                    fallbackIcon={fallbackIcon}
                    size={ARTWORK_SIZE}
                    radius={radius.lg}
                />
            </View>
            <Text size="sm" color="textSecondary" style={styles.status}>
                {t(STATUS_TEXT[state])}
            </Text>
            <View style={styles.actions}>
                <Button
                    variant="outline"
                    tone="primary"
                    onPress={onChangeArtwork}
                    disabled={disabled}
                    accessibilityLabel={t(
                        'editPlaylistInfo.a11y.changeArtwork',
                    )}
                >
                    {t('editPlaylistInfo.changeArtwork')}
                </Button>
                {canRestoreAuto ? (
                    <Button
                        variant="outline"
                        tone="neutral"
                        onPress={onRestoreAuto}
                        disabled={disabled}
                        accessibilityLabel={t(
                            'editPlaylistInfo.a11y.restoreAutoArtwork',
                        )}
                    >
                        {t('editPlaylistInfo.restoreAutoArtwork')}
                    </Button>
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    field: {
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
    },
    status: {
        textAlign: 'center',
    },
    actions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: space.sm,
    },
});
