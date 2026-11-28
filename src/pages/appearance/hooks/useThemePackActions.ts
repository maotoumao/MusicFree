import { useNavigation } from '@react-navigation/native';
import { useAtomValue } from 'jotai';
import { useCallback } from 'react';

import { showToast } from '@/components/overlay';
import {
    BUILTIN_DARK_PACK_ID,
    BUILTIN_LIGHT_PACK_ID,
    isBuiltinThemePackId,
    theme,
    THEME_PACK_MAX_COUNT,
    THEME_PACK_NAME_MAX_LENGTH,
} from '@/core/theme';
import { resolveSelectedPackId, systemColorSchemeAtom } from '@/design';
import { useT } from '@/i18n';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';
import { showTextPromptPanel } from '@/widgets/overlays/TextPromptPanel';

import { themePackName } from '../lib/themePackName';

import type { ThemePack, ThemeSelection } from '@/core/theme';

interface ThemePackActions {
    select(packId: string): void;
    toggleFollowSystem(follow: boolean): void;
    pickSlot(slot: 'day' | 'night'): void;
    openMenu(packId: string): void;
    create(): void;
}

/** 主题网格与模式区的全部命令；页面只做布局，命令与提示集中在此 */
function useThemePackActions(
    packs: readonly ThemePack[],
    selection: ThemeSelection,
): ThemePackActions {
    const t = useT();
    const navigation = useNavigation();
    const systemScheme = useAtomValue(systemColorSchemeAtom);
    const activePackId = resolveSelectedPackId(selection, systemScheme);

    const edit = useCallback(
        (packId: string) => {
            navigation.navigate('ThemeEditor', { packId });
        },
        [navigation],
    );

    /**
     * 立刻应用某套主题：网格里点卡片、新建、创建副本都走这条
     * 跟随系统时只换掉**当前时段**那一槽：既保证马上看得见（绑到另一时段等于没生效），
     * 又不会把用户配好的日 / 夜配对整个抹掉——那是一次无声且不可撤销的设置丢失。
     * 卡片右上角画的就是 day / night 角标，按时段替换才对得上它暗示的语义
     */
    const applyPack = useCallback(
        (packId: string) => {
            if (selection.kind !== 'system') {
                theme.selectPack(packId);
                return;
            }
            const night = systemScheme === 'dark';
            theme.selectSystemPacks(
                night ? selection.dayPackId : packId,
                night ? packId : selection.nightPackId,
            );
        },
        [selection, systemScheme],
    );

    /** 复制成用户主题：内置只读，编辑内置一律先另存 */
    const duplicate = useCallback(
        (sourcePackId: string, title: string, defaultName: string) => {
            showTextPromptPanel<string>({
                title,
                placeholder: t('appearance.theme.namePlaceholder'),
                defaultValue: defaultName,
                selectTextOnFocus: true,
                maxLength: THEME_PACK_NAME_MAX_LENGTH,
                onSubmit: async name => {
                    if (name.trim() === '') {
                        showToast(t('appearance.theme.nameRequired'), {
                            type: 'error',
                        });
                        return { ok: false };
                    }
                    let id: string;
                    try {
                        id = theme.createPack(sourcePackId, name.trim());
                    } catch {
                        // 名称已先行校验，此处只剩数量上限一种可能
                        showToast(
                            t('appearance.theme.limitReached', {
                                count: THEME_PACK_MAX_COUNT,
                            }),
                            { type: 'error' },
                        );
                        return { ok: false };
                    }
                    // 刚建好就选上：编辑器本来就在预览它，返回后不该又跳回旧主题。
                    // 单独 try：主题已经建出来了，选中失败不该退回面板让用户再建一个同名的
                    try {
                        applyPack(id);
                    } catch {
                        // 选中失败不影响主题本身，用户可在网格里手动点选
                    }
                    return { ok: true, result: id };
                },
            }).then(id => {
                if (id !== undefined) {
                    edit(id);
                }
            });
        },
        [applyPack, edit, t],
    );

    // 新建一律以内置深色为底：自定义背景多是照片，深色系压得住、也更耐看；
    // 要从当前这套改起用「创建副本」，那条路径才复制来源主题
    const create = useCallback(() => {
        duplicate(
            BUILTIN_DARK_PACK_ID,
            t('appearance.theme.createTitle'),
            t('appearance.theme.defaultName'),
        );
    }, [duplicate, t]);

    const rename = useCallback(
        (pack: ThemePack) => {
            showTextPromptPanel<boolean>({
                title: t('appearance.theme.renameTitle'),
                placeholder: t('appearance.theme.namePlaceholder'),
                defaultValue: pack.name,
                selectTextOnFocus: true,
                maxLength: THEME_PACK_NAME_MAX_LENGTH,
                onSubmit: async name => {
                    if (name.trim() === '') {
                        showToast(t('appearance.theme.nameRequired'), {
                            type: 'error',
                        });
                        return { ok: false };
                    }
                    theme.renamePack(pack.id, name.trim());
                    return { ok: true, result: true };
                },
            });
        },
        [t],
    );

    const remove = useCallback(
        (pack: ThemePack) => {
            showConfirmDialog({
                title: t('appearance.theme.deleteTitle'),
                message: t('appearance.theme.deleteConfirm', {
                    name: pack.name,
                }),
                danger: true,
            }).then(confirmed => {
                if (confirmed) {
                    theme.deletePack(pack.id).catch(() => {
                        showToast(t('feedback.operationFailed'), {
                            type: 'error',
                        });
                    });
                }
            });
        },
        [t],
    );

    const openMenu = useCallback(
        (packId: string) => {
            const pack = packs.find(item => item.id === packId);
            if (!pack) {
                return;
            }
            const builtin = isBuiltinThemePackId(packId);
            showActionSheetPanel({
                title: themePackName(pack, t),
                items: [
                    ...(builtin
                        ? []
                        : [
                              {
                                  icon: 'palette' as const,
                                  label: t('appearance.theme.edit'),
                                  onPress: () => edit(packId),
                              },
                          ]),
                    {
                        icon: 'copy' as const,
                        label: t('appearance.theme.duplicate'),
                        onPress: () =>
                            duplicate(
                                packId,
                                t('appearance.theme.duplicate'),
                                t('appearance.theme.copyName', {
                                    name: themePackName(pack, t),
                                }),
                            ),
                    },
                    ...(builtin
                        ? []
                        : [
                              {
                                  icon: 'pencil' as const,
                                  label: t('appearance.theme.rename'),
                                  onPress: () => rename(pack),
                              },
                              {
                                  icon: 'trash-2' as const,
                                  label: t('appearance.theme.delete'),
                                  danger: true,
                                  onPress: () => remove(pack),
                              },
                          ]),
                ],
            });
        },
        [duplicate, edit, packs, remove, rename, t],
    );

    const toggleFollowSystem = useCallback(
        (follow: boolean) => {
            if (!follow) {
                // 关掉跟随时固定住此刻正在生效的那套，视觉上不跳变
                theme.selectPack(activePackId);
                return;
            }
            // 打开跟随时把当前主题放进它自己 base 对应的时段，另一时段用内置
            const current = packs.find(pack => pack.id === activePackId);
            const isDark = current?.scheme === 'dark';
            theme.selectSystemPacks(
                isDark ? BUILTIN_LIGHT_PACK_ID : activePackId,
                isDark ? activePackId : BUILTIN_DARK_PACK_ID,
            );
        },
        [activePackId, packs],
    );

    const pickSlot = useCallback(
        (slot: 'day' | 'night') => {
            if (selection.kind !== 'system') {
                return;
            }
            const boundId =
                slot === 'day' ? selection.dayPackId : selection.nightPackId;
            showActionSheetPanel({
                title: t(
                    slot === 'day'
                        ? 'appearance.mode.dayTheme'
                        : 'appearance.mode.nightTheme',
                ),
                items: packs.map(pack => ({
                    label: themePackName(pack, t),
                    selected: pack.id === boundId,
                    onPress: () =>
                        theme.selectSystemPacks(
                            slot === 'day' ? pack.id : selection.dayPackId,
                            slot === 'night' ? pack.id : selection.nightPackId,
                        ),
                })),
            });
        },
        [packs, selection, t],
    );

    return {
        select: applyPack,
        toggleFollowSystem,
        pickSlot,
        openMenu,
        create,
    };
}

export { useThemePackActions };
