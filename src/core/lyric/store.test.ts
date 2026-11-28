import { AppState } from 'react-native';

import { atomStore } from '@/utils/atomStore';

import {
    currentLineAtom,
    NO_ACTIVE_LINE,
    setCurrentLine,
    subscribeLyricContent,
} from './store';

import type { ActiveLine } from './types';

/** uiMirror 首次发布时才挂监听，故要在第一次发布之前把回调截下来 */
jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string,
) => ({ remove: jest.fn() })) as unknown as typeof AppState.addEventListener);

function setAppState(state: string): void {
    (AppState as { currentState: string | null }).currentState = state;
}

function line(index: number): ActiveLine {
    return { index, line: { time: index, text: `第 ${index} 句` } };
}

beforeEach(() => {
    setAppState('active');
    setCurrentLine(NO_ACTIVE_LINE);
});

describe('core 侧的歌词订阅', () => {
    it('后台仍然收到通知——桌面歌词靠它继续跳行，而 atom 是压住不发的', () => {
        const seen: unknown[] = [];
        const unsub = subscribeLyricContent(content => seen.push(content));
        seen.length = 0;

        setAppState('background');
        setCurrentLine(line(3));

        expect(seen).toHaveLength(1);
        // 同一时刻 React 那侧必须还没动：缓冲正是为了让它在后台停下来
        expect(atomStore.get(currentLineAtom).index).toBe(-1);
        unsub();
    });

    it('重复发布同一引用不再扇出——终点是原生调用，多余的会截断切歌动画', () => {
        const seen: unknown[] = [];
        const unsub = subscribeLyricContent(content => seen.push(content));
        seen.length = 0;

        setCurrentLine(NO_ACTIVE_LINE);
        setCurrentLine(NO_ACTIVE_LINE);

        expect(seen).toHaveLength(0);
        unsub();
    });

    it('退订后不再收到', () => {
        const seen: unknown[] = [];
        const unsub = subscribeLyricContent(content => seen.push(content));
        unsub();
        seen.length = 0;

        setCurrentLine(line(5));

        expect(seen).toHaveLength(0);
    });
});
