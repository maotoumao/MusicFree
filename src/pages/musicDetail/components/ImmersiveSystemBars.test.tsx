/**
 * 测的是**作用域**：聚焦期间进入、失焦即退出、复聚焦再进入
 *
 * 三件事各对应一个曾经真实发生（或评审指出会发生）的缺陷：
 * - 不退出 → 按挂载期持有时沉浸态漏到了评论页与歌词编辑页（原生栈压屏不卸载下面的路由）
 * - cleanup 不是本次进入返回的那个函数 → 缓存旧函数会退出错的那一次；**故用 toBe 核引用**
 * - 复聚焦不再进入 → 只在首次进入的实现能通过前两条，但真机上沉浸只在第一次进页生效
 *
 * `create` 必须包在 `act` 里：React 19 的 test renderer 是并发 root，不 flush 的话组件体
 * 还没跑、捕获到的回调是空数组，下面的断言会集体空转
 */
import { act, create } from 'react-test-renderer';

import { ImmersiveSystemBars } from './ImmersiveSystemBars';

/** 每次进入返回**不同**的退出函数：这样「缓存复用」与「退出错的那一次」都会现形 */
const mockExits: jest.Mock[] = [];
const mockEnter = jest.fn(() => {
    const exit = jest.fn();
    mockExits.push(exit);
    return exit;
});
/** 捕获 useFocusEffect 的回调，手动跑并拿到它的 cleanup */
const mockFocusCallbacks: Array<() => (() => void) | void> = [];

jest.mock('@/infra/systemBars', () => ({
    enterImmersiveSystemBars: () => mockEnter(),
}));
jest.mock('@react-navigation/native', () => ({
    useFocusEffect: (callback: () => (() => void) | void) => {
        mockFocusCallbacks.push(callback);
    },
}));

function mount() {
    act(() => {
        create(<ImmersiveSystemBars />);
    });
}

/** 捕获到的那个 focus 回调；顺带确认真的捕获到了（漏捕获会让全部断言空转） */
function focusEffect(): () => (() => void) | void {
    expect(mockFocusCallbacks).toHaveLength(1);
    const callback = mockFocusCallbacks[0];
    expect(callback).toBeInstanceOf(Function);
    return callback as () => (() => void) | void;
}

beforeEach(() => {
    mockFocusCallbacks.length = 0;
    mockExits.length = 0;
    mockEnter.mockClear();
});

it('聚焦时进入一次，失焦时调用**本次进入返回的**退出函数', () => {
    mount();
    const cleanup = focusEffect()();
    expect(mockEnter).toHaveBeenCalledTimes(1);
    expect(mockExits[0]).not.toHaveBeenCalled();

    // 必须原样返回本次进入拿到的退出函数：不返回就永不复位，包一层或缓存旧函数都会退出错的那一次
    // （toBe 核引用；jest.fn 来自另一个 realm，toBeInstanceOf(Function) 会误判，故不用它）
    expect(cleanup).toBe(mockExits[0]);
    cleanup?.();
    expect(mockExits[0]).toHaveBeenCalledTimes(1);
});

it('压屏退出后弹回来会重新进入，且退出的是新那一次', () => {
    mount();
    const effect = focusEffect();

    const firstCleanup = effect();
    expect(mockEnter).toHaveBeenCalledTimes(1);
    firstCleanup?.();
    expect(mockExits[0]).toHaveBeenCalledTimes(1);

    const secondCleanup = effect();
    // 缓存退出函数、只在首次进入的实现会卡在 1 次
    expect(mockEnter).toHaveBeenCalledTimes(2);
    expect(secondCleanup).toBe(mockExits[1]);
    secondCleanup?.();
    expect(mockExits[1]).toHaveBeenCalledTimes(1);
    expect(mockExits[0]).toHaveBeenCalledTimes(1);
});

it('重渲染不重复进入：回调引用恒定，useFocusEffect 不会重跑', () => {
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
        tree = create(<ImmersiveSystemBars />);
    });
    act(() => {
        tree?.update(<ImmersiveSystemBars />);
    });
    // 两次都要真捕获到，否则 undefined === undefined 会让断言空转
    expect(mockFocusCallbacks).toHaveLength(2);
    expect(mockFocusCallbacks[0]).toBeInstanceOf(Function);
    // 依赖数组写错（或去掉 useCallback）会换引用 → 真机上每次重渲染都退出 + 进入一轮
    expect(mockFocusCallbacks[1]).toBe(mockFocusCallbacks[0]);
});

it('无渲染产出', () => {
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
        tree = create(<ImmersiveSystemBars />);
    });
    expect(tree?.toJSON()).toBeNull();
});
