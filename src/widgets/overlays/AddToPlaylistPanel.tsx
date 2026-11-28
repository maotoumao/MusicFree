import { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { definePanel, showToast } from '@/components/overlay';
import { Icon } from '@/components/ui/Icon';
import { ListItem } from '@/components/ui/ListItem';
import { Text } from '@/components/ui/Text';
import {
    LOCAL_PLAYLIST_TITLE_MAX_LENGTH,
    playlist,
    useLocalPlaylists,
} from '@/core/playlist';
import { layout, radius, space, useColors } from '@/design';
import { useT } from '@/i18n';
import { clampToMaxLength } from '@/utils/text';
import { LocalPlaylistRow } from '@/widgets/LocalPlaylistRow';
import { showTextPromptPanel } from '@/widgets/overlays/TextPromptPanel';

import type { OverlayProps } from '@/components/overlay';
import type { MusicItem } from '@/types';

export interface AddToPlaylistInput {
    items: readonly MusicItem[];
    /** 「新建歌单」时预填的名称（如来源集合标题），用户可改 */
    suggestedPlaylistName?: string;
}

function AddToPlaylistPanelView({
    payload,
    close,
}: OverlayProps<AddToPlaylistInput, void>) {
    const { items, suggestedPlaylistName } = payload;
    const t = useT();
    const colors = useColors();
    const playlists = useLocalPlaylists();
    // 串行 core 写入期间防重入：避免多行连点把歌加到多个歌单
    const pendingRef = useRef(false);

    const addTo = async (id: string) => {
        if (pendingRef.current) {
            return;
        }
        pendingRef.current = true;
        try {
            const { added, duplicates, invalid } =
                await playlist.addMusicToLocalPlaylist(id, items);
            if (added > 0) {
                // 有新增即成功；同时有无效项则 warning 提示部分未加入
                const partial = invalid > 0;
                showToast(
                    partial
                        ? t('addToPlaylistPanel.addedPartial', { count: added })
                        : t('addToPlaylistPanel.added', { count: added }),
                    { type: partial ? 'warning' : 'success' },
                );
                close();
                return;
            }
            // 无新增：仅重复（无无效）→ 全部已在歌单中；有无效项 → 失败，留面板改选
            if (invalid === 0 && duplicates > 0) {
                showToast(t('addToPlaylistPanel.allExist'), { type: 'info' });
                close();
                return;
            }
            showToast(t('feedback.operationFailed'), { type: 'error' });
            pendingRef.current = false;
        } catch {
            showToast(t('feedback.operationFailed'), { type: 'error' });
            pendingRef.current = false;
        }
    };

    // 新建 + 加入在 onSubmit 内作为已承诺流程一次跑完：即便提交中被取消/关掉，
    // 两次写入也已发出（不会留空歌单）；建失败留面板重试无残留，加失败也不回滚已建歌单
    const createAndAdd = async () => {
        if (pendingRef.current) {
            return;
        }
        pendingRef.current = true;
        // 预填名与输入上限对齐：超长来源标题先截断，免得展示值和最终存下的不一致
        const defaultName =
            suggestedPlaylistName === undefined
                ? undefined
                : clampToMaxLength(
                      suggestedPlaylistName.trim(),
                      LOCAL_PLAYLIST_TITLE_MAX_LENGTH,
                  );
        const created = await showTextPromptPanel<string>({
            title: t('addToPlaylistPanel.createNew'),
            placeholder: t('addToPlaylistPanel.playlistName'),
            defaultValue: defaultName,
            // 预填名聚焦即全选：直接确认沿用，打字则整体替换
            selectTextOnFocus: true,
            maxLength: LOCAL_PLAYLIST_TITLE_MAX_LENGTH,
            onSubmit: async name => {
                let id: string;
                try {
                    id = await playlist.createLocalPlaylist({
                        title: name.trim(),
                    });
                } catch {
                    showToast(t('feedback.operationFailed'), { type: 'error' });
                    return { ok: false };
                }
                try {
                    // 新建歌单本身无既有曲目，added 即成功加入数
                    const { added } = await playlist.addMusicToLocalPlaylist(
                        id,
                        items,
                    );
                    showToast(
                        added > 0
                            ? t('addToPlaylistPanel.added', { count: added })
                            : t('addToPlaylistPanel.createdAddFailed'),
                        { type: added > 0 ? 'success' : 'error' },
                    );
                } catch {
                    // 歌单已建、加曲失败：不回滚已建歌单，给明确提示（非笼统「操作失败」）
                    showToast(t('addToPlaylistPanel.createdAddFailed'), {
                        type: 'error',
                    });
                }
                return { ok: true, result: id };
            },
        });
        pendingRef.current = false;
        if (created !== undefined) {
            close();
        }
    };

    return (
        <View style={styles.root}>
            <Text
                size="xl"
                weight="bold"
                lineHeight="tight"
                style={styles.title}
            >
                {t('addToPlaylistPanel.title')}
            </Text>
            <ScrollView style={styles.body}>
                <ListItem
                    leading={
                        <View
                            style={[
                                styles.thumb,
                                styles.thumbFallback,
                                { backgroundColor: colors.surfaceVariant },
                            ]}
                        >
                            <Icon name="plus" size="md" color="text" />
                        </View>
                    }
                    title={
                        <Text size="md">
                            {t('addToPlaylistPanel.createNew')}
                        </Text>
                    }
                    onPress={createAndAdd}
                    accessibilityLabel={t('addToPlaylistPanel.createNew')}
                />
                {playlists.map(p => (
                    <LocalPlaylistRow
                        key={p.id}
                        item={p}
                        onPress={() => addTo(p.id)}
                    />
                ))}
            </ScrollView>
        </View>
    );
}

/** 加入歌单 picker：列用户本地歌单 + 新建；选中即把所选歌曲加入并关闭 */
export const showAddToPlaylistPanel = definePanel(AddToPlaylistPanelView);

const styles = StyleSheet.create({
    root: {
        flexGrow: 1,
        flexShrink: 1,
    },
    title: {
        paddingHorizontal: space.lg,
        paddingBottom: space.md,
    },
    body: {
        flexGrow: 1,
        flexShrink: 1,
    },
    // 「新建」行的图标底：与 LocalPlaylistRow 的封面同尺寸同圆角，两者才对齐
    thumb: {
        width: layout.mediaThumbnail,
        height: layout.mediaThumbnail,
        borderRadius: radius.md,
    },
    thumbFallback: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
