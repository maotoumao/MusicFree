/**
 * 歌词侧的溢出动作（复制歌词 / 编辑歌词 / 恢复默认歌词 / 桌面歌词设置）
 *
 * 竖屏由歌词工具行的「更多」展开，短窗口由顶栏的溢出菜单接管——两处必须是同一份，
 * 否则短窗口会静悄悄少掉四个动作（曾经就少过）。故动作表在此，两个组件都只负责摆放
 */
import { useNavigation } from '@react-navigation/native';
import { useCallback, useMemo, useRef } from 'react';

import { showToast } from '@/components/overlay';
import { useConfig } from '@/core/config';
import { lyric, useLyric } from '@/core/lyric';
import { useCurrentMusic } from '@/core/player';
import { useT } from '@/i18n';
import { copyText } from '@/infra/clipboard';
import { os } from '@/infra/device';
import { stash } from '@/infra/stash';

import { useFloatingLyricToggle } from './useFloatingLyricToggle';

import type { ActionSheetItem } from '@/widgets/overlays/ActionSheetPanel';

export function useLyricMoreItems(): ActionSheetItem[] {
    const t = useT();
    const navigation = useNavigation();
    const currentMusic = useCurrentMusic();
    const { hasTranslation, origin, lines } = useLyric();
    const showTranslation = useConfig('lyric.showTranslation') ?? false;
    const { openSettings: openFloatingLyricSettings } =
        useFloatingLyricToggle();

    // 恢复默认歌词：清掉手动指定的来源（关联与自己编的一并清），回落插件默认词；清写罕见但可能失败，失败给 toast
    const handleRestoreDefault = useCallback(async () => {
        if (!currentMusic) {
            return;
        }
        try {
            await lyric.resetLyric(currentMusic);
            showToast(t('musicDetail.restoreDefaultLyricSuccess'), {
                type: 'success',
            });
        } catch {
            showToast(t('feedback.operationFailed'), { type: 'error' });
        }
    }, [currentMusic, t]);

    const withTranslation = showTranslation && hasTranslation;
    /**
     * 有没有可复制的内容——据此置灰菜单项
     * 只有时间戳、正文为空的行会被解析保留，故按去空白后是否还有字判定，而非行数。
     * 只算布尔不拼整篇：本 hook 也挂在短窗口的顶栏里，歌词每次取回都拼一遍整首没必要
     */
    const hasCopyableText = useMemo(
        () =>
            lines.some(
                line =>
                    line.text.trim() !== '' ||
                    (withTranslation &&
                        (line.translation?.trim() ?? '') !== ''),
            ),
        [lines, withTranslation],
    );
    /**
     * ActionSheet 存的是打开那一刻的回调快照——面板开着时若切了歌或歌词刚取回，
     * 闭包里的内容就过期了。故经 ref 在点击那一刻取最新的行，那时才拼文本
     */
    const linesRef = useRef({ lines, withTranslation });
    linesRef.current = { lines, withTranslation };
    const copyLyric = useCallback(async () => {
        // 所见即所得——正在显示译文时连译文一并复制
        // 不带时间戳：时间轴是给播放器看的，用户复制走是要读或转发
        const snapshot = linesRef.current;
        const text = snapshot.lines
            .map(line =>
                snapshot.withTranslation && line.translation
                    ? `${line.text}\n${line.translation}`
                    : line.text,
            )
            .join('\n');
        // 打开面板后歌词变没了（切歌等）：如实说一句，不做静默空操作
        if (text.trim() === '') {
            showToast(t('musicDetail.noLyric'));
            return;
        }
        try {
            await copyText(text);
            showToast(t('feedback.copied'), { type: 'success' });
        } catch {
            showToast(t('feedback.operationFailed'), { type: 'error' });
        }
    }, [t]);

    /**
     * 复制歌词恒在（无词时置灰，让能力可见）
     * 恢复默认仅在当前歌有手动指定来源时出现；桌面歌词设置 Android 专属
     */
    return useMemo(() => {
        const items: ActionSheetItem[] = [
            {
                icon: 'copy',
                label: t('musicDetail.copyLyric'),
                disabled: !hasCopyableText,
                onPress: copyLyric,
            },
        ];
        if (currentMusic) {
            items.push({
                icon: 'pencil',
                label: t('musicDetail.editLyric'),
                onPress: () =>
                    navigation.navigate('EditLyric', {
                        ticket: stash(currentMusic),
                    }),
            });
        }
        if (origin.kind !== 'plugin') {
            items.push({
                icon: 'refresh-cw',
                label: t('musicDetail.restoreDefaultLyric'),
                onPress: handleRestoreDefault,
            });
        }
        if (os === 'android') {
            items.push({
                icon: 'settings',
                label: t('musicDetail.lyricTools.floatingLyricSettings'),
                onPress: openFloatingLyricSettings,
            });
        }
        return items;
    }, [
        t,
        hasCopyableText,
        copyLyric,
        currentMusic,
        navigation,
        origin.kind,
        handleRestoreDefault,
        openFloatingLyricSettings,
    ]);
}
