import { useMemo } from 'react';

import { LYRIC_MAX_LENGTH, parseLyric } from '@/core/lyric';
import { useT } from '@/i18n';

import type { LyricSegment } from './useEditLyricDraft';
import type { IconName } from '@/components/ui/icons.generated';

/** 状态条要显示的一句陈述 */
export interface ParseStatus {
    icon: IconName;
    /** 只有「行数不一致」着 warning——它确实预示译文错行；其余一律中性 */
    tone: 'textSecondary' | 'warning';
    text: string;
}

interface ParseStatusInput {
    segment: LyricSegment;
    lyric: string;
    translation: string;
    /** 已持久化过自定义词：决定空态说「未输入」还是「清空并保存将恢复默认」 */
    hasCustomLyric: boolean;
}

/**
 * 由草稿文本推出状态条内容
 *
 * 带不带 [mm:ss.xx] 前缀在输入框里是同一堆文字，后果却完全不同（纯文本不随播放滚动、
 * 没有当前行）。措辞一律说后果不说属性，也不劝导——纯文本是合法降级，不是用户做错了什么
 */
export function useParseStatus({
    segment,
    lyric,
    translation,
    hasCustomLyric,
}: ParseStatusInput): ParseStatus {
    const t = useT();
    return useMemo(() => {
        const parsed = parseLyric(lyric);
        if (segment === 'translation') {
            const parsedTranslation = parseLyric(translation);
            // 用逻辑行数而非 lines.length：一行多时间戳会展开成多条播放行，
            // 拿展开数报「正文 N 行」会虚高，还会误报行数不一致
            const count = parsedTranslation.sourceLines;
            if (translation.length >= LYRIC_MAX_LENGTH) {
                return {
                    icon: 'triangle-alert',
                    tone: 'textSecondary',
                    text: t('editLyric.statusMaxLength', { count }),
                };
            }
            // 两轨都有时间轴才按时间戳合并，行数对不上也不会串位
            if (parsed.timed && parsedTranslation.timed) {
                return {
                    icon: 'clock',
                    tone: 'textSecondary',
                    text: t('editLyric.statusTranslationTimed', { count }),
                };
            }
            if (count === parsed.sourceLines) {
                return {
                    icon: 'book-open',
                    tone: 'textSecondary',
                    text: t('editLyric.statusTranslationByLine', { count }),
                };
            }
            return {
                icon: 'triangle-alert',
                tone: 'warning',
                text: t('editLyric.statusTranslationMismatch', {
                    count,
                    total: parsed.sourceLines,
                }),
            };
        }
        if (!lyric.trim()) {
            return {
                icon: 'info',
                tone: 'textSecondary',
                text: hasCustomLyric
                    ? t('editLyric.statusWillRestore')
                    : t('editLyric.statusEmpty'),
            };
        }
        const count = parsed.sourceLines;
        if (lyric.length >= LYRIC_MAX_LENGTH) {
            return {
                icon: 'triangle-alert',
                tone: 'textSecondary',
                text: t('editLyric.statusMaxLength', { count }),
            };
        }
        return parsed.timed
            ? {
                  icon: 'clock',
                  tone: 'textSecondary',
                  text: t('editLyric.statusTimed', { count }),
              }
            : {
                  icon: 'book-open',
                  tone: 'textSecondary',
                  text: t('editLyric.statusPlain', { count }),
              };
    }, [segment, lyric, translation, hasCustomLyric, t]);
}
