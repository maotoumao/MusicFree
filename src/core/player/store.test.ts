import { AppState } from 'react-native';

import { atomStore } from '@/utils/atomStore';

import { getProgress, progressAtom, setProgress } from './store';

// store 只从 audioEngine 取 PlaybackState 这个枚举，不需要真桥
jest.mock('@/native/audioEngine', () => ({
    PlaybackState: { Idle: 'idle', Playing: 'playing', Paused: 'paused' },
}));

/** uiMirror 首次发布时才挂监听，故要在第一次 setProgress 之前把回调截下来 */
let notifyAppState: ((state: string) => void) | undefined;
jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string,
    cb: (state: string) => void,
) => {
    notifyAppState = cb;
    return { remove: jest.fn() };
}) as unknown as typeof AppState.addEventListener);

function setAppState(state: string): void {
    (AppState as { currentState: string | null }).currentState = state;
}

beforeEach(() => {
    setAppState('active');
    setProgress({ position: 0, duration: 0, buffered: 0 });
});

describe('后台播放期间的进度发布', () => {
    it('不写 atom——每 500ms 一拍直写会在不可见期间堆出成千上万条 mount 指令', () => {
        setAppState('background');
        for (let tick = 1; tick <= 7200; tick += 1) {
            setProgress({ position: tick, duration: 300, buffered: tick });
        }

        expect(atomStore.get(progressAtom).position).toBe(0);
    });

    it('程序读仍是最新的——落盘节流与歌词对齐都靠它', () => {
        setAppState('background');
        setProgress({ position: 123, duration: 300, buffered: 130 });

        expect(getProgress().position).toBe(123);
    });

    it('回前台把最后一拍刷进去', () => {
        setAppState('background');
        setProgress({ position: 1, duration: 300, buffered: 1 });
        setProgress({ position: 2, duration: 300, buffered: 2 });
        setAppState('active');
        notifyAppState?.('active');

        expect(atomStore.get(progressAtom).position).toBe(2);
    });
});
