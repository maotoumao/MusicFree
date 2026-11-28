import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { showToast } from '@/components/overlay';
import { LYRIC_MAX_LENGTH, lyric as lyricCore } from '@/core/lyric';
import { t } from '@/i18n';
import { pickTextFile } from '@/infra/documentPicker';
import { clampToMaxLength } from '@/utils/text';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import type { LyricText } from '@/core/lyric';
import type { MusicItem } from '@/types';

/** 当前在编辑哪一段 */
export type LyricSegment = 'lyric' | 'translation';

/**
 * 打字时不重解析：去抖 300ms 再落 state
 * 状态条宁可落后 300ms 也不能在打字时抖动——会跳变的一行比落后的一行更干扰
 */
const PARSE_DEBOUNCE_MS = 300;

/**
 * 按 UTF-8 解出的替换字符数达到此值即判定源文件是别的编码（GBK 等）
 * 正常歌词文件几乎不会含 U+FFFD，故阈值取得很低；不做编码猜测——粘贴路径可以完全绕开
 */
const ENCODING_FAILURE_THRESHOLD = 3;

/**
 * 导入文件的体积上限（字节）
 * 选择器不限类型，用户可能误选视频；一份歌词再大也到不了几 MB
 */
const IMPORT_MAX_BYTES = 4 * 1024 * 1024;

/**
 * 预填等待上限：超过就空白进入，不把编辑器锁在 Loading
 * 取得短是因为常见路径命中文件缓存、本就毫秒级；真慢的那次也不必干等——
 * 取词迟到返回时，只要草稿还没动过就会补装上（见 effect）
 */
const PREFILL_TIMEOUT_MS = 3_000;

export interface EditLyricDraft {
    /** 预填完成前显示 Loading，不以空白进入编辑（否则一保存就把插件词覆盖成空） */
    ready: boolean;
    segment: LyricSegment;
    setSegment: (segment: LyricSegment) => void;
    /** 译文段是否存在（决定显示不显示分段控件） */
    hasTranslation: boolean;
    /** 画布的 defaultValue：非受控输入，只有外部改写（导入 / 移除译文）才随 revision 换新 */
    lyricInitial: string;
    translationInitial: string;
    /** 各段的外部改写计数：变了就让该段画布重挂；分开计数才不会连带重挂另一段 */
    lyricRevision: number;
    translationRevision: number;
    /** 去抖后的文本快照，驱动解析状态条 */
    lyricText: string;
    translationText: string;
    onChangeLyric: (value: string) => void;
    onChangeTranslation: (value: string) => void;
    canSave: boolean;
    save: () => void;
    addTranslation: () => void;
    removeTranslation: () => void;
    importFromFile: () => void;
    /** 已持久化自定义词才给「恢复默认歌词」——不提供不产生任何效果的操作 */
    hasCustomLyric: boolean;
    restoreDefault: () => void;
}

/**
 * 歌词编辑草稿：预填当前生效的词 → 本地草稿 → 乐观保存 + 放弃确认
 *
 * 文本存在 ref 里、只有去抖后才进 state：几百行的 multiline 每键一次完整重渲会掉帧。
 * 保存读的是 ref（最新值），状态条读的是 state（可以落后）
 */
export function useEditLyricDraft(
    target: MusicItem | undefined,
): EditLyricDraft {
    const navigation = useNavigation();

    const [ready, setReady] = useState(false);
    const [segment, setSegment] = useState<LyricSegment>('lyric');
    const [hasTranslation, setHasTranslation] = useState(false);
    const [hasCustomLyric, setHasCustomLyric] = useState(false);
    const [lyricRevision, setLyricRevision] = useState(0);
    const [translationRevision, setTranslationRevision] = useState(0);
    const [initial, setInitial] = useState({ lyric: '', translation: '' });
    const [lyricText, setLyricText] = useState('');
    const [translationText, setTranslationText] = useState('');
    /**
     * 与基线不同；**不走去抖**——它同时管着保存按钮和返回拦截，
     * 落后 300ms 意味着刚打完一个字就返回会不经确认丢掉草稿
     */
    const [dirty, setDirty] = useState(false);

    // 画布是非受控的，权威值在 ref；state 只是给状态条看的去抖快照
    const lyricRef = useRef('');
    const translationRef = useRef('');
    // 进入时锁定的基线：改动判定只对它比较
    const baselineRef = useRef<{ lyric: string; translation: string } | null>(
        null,
    );
    /**
     * 用户是否已接管草稿：**单调**，一旦置位不再复位
     * 迟到的预填据此决定补不补装——只看「此刻是不是空的」会误判「输入后又全删回空」
     */
    const touchedRef = useRef(false);

    // 预填「当前生效的词」而非空白：搜到一份大体正确的词后进来改几个字，是最顺的一条路
    useEffect(() => {
        if (!target) {
            return;
        }
        let alive = true;
        // 取词可能慢、可能抛错、也可能永不结算（插件挂了），都不能把编辑器锁在 Loading
        let entered = false;
        const enter = (text: LyricText | null, isCustom: boolean) => {
            entered = true;
            const rawLrc = text?.rawLrc ?? '';
            const translation = text?.translation ?? '';
            baselineRef.current = { lyric: rawLrc, translation };
            lyricRef.current = rawLrc;
            translationRef.current = translation;
            setInitial({ lyric: rawLrc, translation });
            setLyricText(rawLrc);
            setTranslationText(translation);
            setHasTranslation(translation !== '');
            // 不变量：没有译文段就不能停在译文段，否则两块画布都不渲染、页面空着
            setSegment('lyric');
            setHasCustomLyric(isCustom);
            setDirty(false);
            // 画布非受控，迟到的预填要靠重挂才装得进去；首次进入时画布还没挂，多加一次无副作用
            setLyricRevision(prev => prev + 1);
            setTranslationRevision(prev => prev + 1);
            setReady(true);
        };
        const timer = setTimeout(() => {
            if (!alive || entered) {
                return;
            }
            // 空白进入是无奈之选，但必须说清是「没读到」而非「这首没词」——
            // 否则用户会以为本来就没有，一保存就把原来的词覆盖没了
            enter(null, false);
            showToast(t('editLyric.loadCurrentFailed'), { type: 'warning' });
        }, PREFILL_TIMEOUT_MS);
        const load = async () => {
            let effective;
            try {
                effective = await lyricCore.getEffectiveLyric(target);
            } catch {
                if (alive && !entered) {
                    enter(null, false);
                    showToast(t('editLyric.loadCurrentFailed'), {
                        type: 'warning',
                    });
                }
                return;
            }
            if (!alive) {
                return;
            }
            // 已空白进入过：只要用户还没接管就补装上，别让短超时白丢一份预填。
            // 判据必须是单调的「动过没有」而不是「此刻是不是空的」——
            // 输入后又全删回空、或刚点了添加译文，都算已接管，这时补装会掀掉他正在做的事
            if (entered && touchedRef.current) {
                return;
            }
            enter(effective.text, effective.origin.kind === 'custom');
        };
        load().catch(() => {});
        return () => {
            alive = false;
            clearTimeout(timer);
        };
    }, [target]);

    // 去抖：打字期间只写 ref，静下来 300ms 才同步给状态条
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const scheduleSync = useCallback(() => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setLyricText(lyricRef.current);
            setTranslationText(translationRef.current);
        }, PARSE_DEBOUNCE_MS);
    }, []);
    useEffect(() => () => clearTimeout(debounceRef.current), []);

    /** 与进入时的基线比对；尾部空白不算改动（保存时本来就会削掉） */
    const computeDirty = useCallback(() => {
        const baseline = baselineRef.current;
        return (
            baseline !== null &&
            (lyricRef.current.trimEnd() !== baseline.lyric.trimEnd() ||
                translationRef.current.trimEnd() !==
                    baseline.translation.trimEnd())
        );
    }, []);

    /** 外部改写（导入 / 移除译文）：立即同步、不走去抖——用户改完就在等这行反馈 */
    const replaceSegmentText = useCallback(
        (which: LyricSegment, value: string) => {
            touchedRef.current = true;
            if (which === 'lyric') {
                lyricRef.current = value;
                // 画布是非受控的，只有重挂才能把新文本装进去；两段各自计数，不连带重挂另一段
                setLyricRevision(prev => prev + 1);
            } else {
                translationRef.current = value;
                setTranslationRevision(prev => prev + 1);
            }
            clearTimeout(debounceRef.current);
            setInitial(prev =>
                which === 'lyric'
                    ? { ...prev, lyric: value }
                    : { ...prev, translation: value },
            );
            setLyricText(lyricRef.current);
            setTranslationText(translationRef.current);
            setDirty(computeDirty());
        },
        [computeDirty],
    );

    const onChangeLyric = useCallback(
        (value: string) => {
            touchedRef.current = true;
            lyricRef.current = value;
            setDirty(computeDirty());
            scheduleSync();
        },
        [computeDirty, scheduleSync],
    );
    const onChangeTranslation = useCallback(
        (value: string) => {
            touchedRef.current = true;
            translationRef.current = value;
            setDirty(computeDirty());
            scheduleSync();
        },
        [computeDirty, scheduleSync],
    );

    const addTranslation = useCallback(() => {
        touchedRef.current = true;
        setHasTranslation(true);
        setSegment('translation');
    }, []);

    const removeTranslation = useCallback(() => {
        const confirm = async () => {
            const ok = await showConfirmDialog({
                title: t('editLyric.removeTranslationTitle'),
                message: t('editLyric.removeTranslationMessage'),
                confirmText: t('editLyric.removeTranslation'),
                cancelText: t('common.cancel'),
                danger: true,
            });
            if (!ok) {
                return;
            }
            // 草稿层动作，仍需保存才生效
            replaceSegmentText('translation', '');
            setHasTranslation(false);
            setSegment('lyric');
        };
        confirm().catch(() => {});
    }, [replaceSegmentText]);

    // 选择器进行中防重入：快速双击的第二次会被原生以 PickingInProgress 拒绝、误报读取失败
    const pickingRef = useRef(false);
    const importFromFile = useCallback(() => {
        if (pickingRef.current) {
            return;
        }
        pickingRef.current = true;
        touchedRef.current = true;
        const run = async () => {
            const current =
                segment === 'lyric' ? lyricRef.current : translationRef.current;
            if (current.trim()) {
                const ok = await showConfirmDialog({
                    title: t('editLyric.overwriteTitle'),
                    message: t('editLyric.overwriteMessage'),
                    confirmText: t('editLyric.importFile'),
                    cancelText: t('common.cancel'),
                });
                if (!ok) {
                    return;
                }
            }
            let picked;
            try {
                // .lrc 无标准 MIME，按扩展名过滤不可靠 → 交系统选择器、读进来再判断
                picked = await pickTextFile({
                    types: ['*/*'],
                    maxBytes: IMPORT_MAX_BYTES,
                });
            } catch {
                showToast(t('editLyric.readFileFailed'), { type: 'error' });
                return;
            }
            if (!picked) {
                return;
            }
            if (!picked.text.trim()) {
                showToast(t('editLyric.readFileFailed'), { type: 'error' });
                return;
            }
            if (
                countReplacementChars(picked.text) >= ENCODING_FAILURE_THRESHOLD
            ) {
                showToast(t('editLyric.encodingFailed'), { type: 'error' });
                return;
            }
            // 这里就要代理对安全截断：裸 slice 切出的半个 emoji 会一直带到落盘
            // （长度恰好等于上限时，core 那道兑底截断不会再动它）
            replaceSegmentText(
                segment,
                clampToMaxLength(picked.text, LYRIC_MAX_LENGTH),
            );
        };
        run()
            .catch(() => {
                showToast(t('editLyric.readFileFailed'), { type: 'error' });
            })
            .finally(() => {
                pickingRef.current = false;
            });
    }, [segment, replaceSegmentText]);

    // 保存后主动离开的放行标记
    const leavingRef = useRef(false);

    // 乐观保存：先返回卸载本页，再后台写；写失败以全局 toast 提示，不回本页重试
    const save = useCallback(() => {
        // 按 ref 重算而非用 dirty：写盘的是 ref 里的最新值，判据就该和它同源
        if (!target || !computeDirty()) {
            return;
        }
        const text = {
            rawLrc: lyricRef.current,
            translation: translationRef.current,
        };
        leavingRef.current = true;
        navigation.goBack();
        lyricCore.setCustomLyric(target, text).catch(() => {
            showToast(t('editLyric.saveFailed'), { type: 'error' });
        });
    }, [target, computeDirty, navigation]);

    const restoreDefault = useCallback(() => {
        if (!target) {
            return;
        }
        const confirm = async () => {
            const ok = await showConfirmDialog({
                title: t('editLyric.restoreDefaultTitle'),
                message: t('editLyric.restoreDefaultMessage'),
                confirmText: t('editLyric.restoreDefault'),
                cancelText: t('common.cancel'),
                danger: true,
            });
            if (!ok) {
                return;
            }
            leavingRef.current = true;
            navigation.goBack();
            await lyricCore.resetLyric(target).catch(() => {
                showToast(t('editLyric.saveFailed'), { type: 'error' });
            });
        };
        confirm().catch(() => {});
    }, [target, navigation]);

    // 拦截返回：保存 / 恢复默认主动离开放行；否则确认放弃
    usePreventRemove(dirty, ({ data }) => {
        if (leavingRef.current) {
            navigation.dispatch(data.action);
            return;
        }
        showConfirmDialog({
            title: t('editLyric.discardTitle'),
            message: t('editLyric.discardMessage'),
            confirmText: t('editLyric.discardChanges'),
            cancelText: t('editLyric.continueEditing'),
            danger: true,
        })
            .then(ok => {
                if (ok) {
                    navigation.dispatch(data.action);
                }
            })
            .catch(() => {});
    });

    return {
        ready,
        segment,
        setSegment,
        hasTranslation,
        lyricInitial: initial.lyric,
        translationInitial: initial.translation,
        lyricRevision,
        translationRevision,
        lyricText,
        translationText,
        onChangeLyric,
        onChangeTranslation,
        canSave: dirty,
        save,
        addTranslation,
        removeTranslation,
        importFromFile,
        hasCustomLyric,
        restoreDefault,
    };
}

/** U+FFFD 计数：按 UTF-8 解码失败的字节都会变成它 */
function countReplacementChars(text: string): number {
    let count = 0;
    for (const char of text) {
        if (char === '\uFFFD') {
            count += 1;
        }
    }
    return count;
}
