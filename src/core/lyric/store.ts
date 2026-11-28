/**
 * 歌词反应式状态层：Lyric 管理器通过 setXxx / publishXxx 发布，React 侧 hooks 读取
 * 内容（lyricAtom）低频、当前行（currentLineAtom）高频，拆两个 atom 避免每 tick 重渲整列
 * 时间轴偏移（lyricOffsetAtom）单独维护：seek 与偏移面板各自读取，修改偏移不重新发布内容；当前行仅在命中行变化时单独更新
 *
 * atom 只发给 React，且经 `uiMirror` 缓冲（后台不写、回前台一次刷入）。
 * core 侧的订阅者（桌面歌词）走本模块自己的回调扇出 `subscribeLyricContent`——
 * 它在后台必须继续跳行，而缓冲恰恰是要让 React 在后台停下来，两者不能共用一条通路
 */
import { atom } from 'jotai';

import { publishToUi, readLatest } from '@/infra/uiMirror';

import type {
    ActiveLine,
    LyricContent,
    LyricOffset,
    LyricState,
} from './types';
import type { PrimitiveAtom } from 'jotai';

const INITIAL_STATE: LyricState = {
    status: 'unavailable',
    lines: [],
    meta: {},
    hasTranslation: false,
    timed: false,
    origin: { kind: 'plugin' },
};

/** 无当前行的哨兵值（复用同一引用，重复发布不触发重渲染） */
export const NO_ACTIVE_LINE: ActiveLine = { index: -1, line: null };

export const lyricAtom = atom<LyricState>(INITIAL_STATE);
export const currentLineAtom = atom<ActiveLine>(NO_ACTIVE_LINE);

export function setLyricState(state: LyricState): void {
    if (publishChanged(lyricAtom, state)) {
        notifyContent();
    }
}

export function setCurrentLine(line: ActiveLine): void {
    if (publishChanged(currentLineAtom, line)) {
        notifyContent();
    }
}

/**
 * 发布并回报「是否真的变了」
 *
 * 相同引用不再往下扇出：`NO_ACTIVE_LINE` 这类哨兵会被反复写入（无词的歌之间
 * 切换、关联 / 编辑 / 恢复默认歌词都会走一次），而扇出的终点是桌面歌词的原生
 * 调用——状态栏条直接赋文本、卡片会先 `animate().cancel()`，重复通知正撞上切歌
 * 淡入淡出时会把动画截断。此前挂在 `atomStore.sub` 上时由 jotai 的 `Object.is`
 * 挡着，改成手动扇出后这道闸门要自己补回来。
 * 比对基准取 `readLatest` 而非 atom 当前值：后台不写 atom，拿 atom 比会与
 * 「上一次发布的值」脱节
 */
function publishChanged<T>(target: PrimitiveAtom<T>, value: T): boolean {
    if (Object.is(readLatest(target), value)) {
        return false;
    }
    publishToUi(target, value);
    return true;
}

/** 歌词时间轴偏移的初始值（复用同一引用，重复发布不触发重渲染） */
export const NO_LYRIC_OFFSET: LyricOffset = { effective: 0, user: 0 };

export const lyricOffsetAtom = atom<LyricOffset>(NO_LYRIC_OFFSET);

export function publishLyricOffset(offset: LyricOffset): void {
    publishToUi(lyricOffsetAtom, offset);
}

/** 无内容哨兵（复用引用，重复派生不产生新对象） */
const NO_LYRIC_CONTENT: LyricContent = { kind: 'none' };

/** 从内容状态 + 当前行派生「要显示的内容」：区分定时当前行 / 纯文本开头 / 无 */
function deriveLyricContent(
    state: LyricState,
    active: ActiveLine,
): LyricContent {
    if (state.status !== 'loaded') {
        return NO_LYRIC_CONTENT;
    }
    if (state.timed) {
        return active.line
            ? { kind: 'line', line: active.line }
            : NO_LYRIC_CONTENT;
    }
    // 纯文本无当前行概念：静态显示开头（第一行）
    const first = state.lines[0];
    return first ? { kind: 'line', line: first } : NO_LYRIC_CONTENT;
}

/**
 * 订阅「要显示的歌词内容」：派生自 lyricAtom + currentLineAtom（单一真相源），订阅即回放当前快照
 * 内容变化时通知；可能重复同内容（消费方 / 原生按文本幂等去重即可）
 *
 * 走回调而不是 `atomStore.sub`：唯一的消费方是桌面歌词，它在后台必须继续跳行，
 * 而 atom 在后台是被 `uiMirror` 压住不发的。core 之间用回调、atom 只留给 React，
 * 与 `player` 的分工一致（`subscribeCurrentMusic` 等同样是回调）
 */
const contentListeners = new Set<(content: LyricContent) => void>();

/** 取当前应显示的内容：读最新值，不受 UI 缓冲影响 */
function currentContent(): LyricContent {
    return deriveLyricContent(
        readLatest(lyricAtom),
        readLatest(currentLineAtom),
    );
}

function notifyContent(): void {
    if (contentListeners.size === 0) {
        return;
    }
    const content = currentContent();
    contentListeners.forEach(cb => cb(content));
}

export function subscribeLyricContent(
    cb: (content: LyricContent) => void,
): () => void {
    cb(currentContent());
    contentListeners.add(cb);
    return () => {
        contentListeners.delete(cb);
    };
}
