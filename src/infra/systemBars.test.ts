/**
 * 两端走的机制不同，各测一条：Android 必须成对调原生（true → false）；
 * iOS 必须 pop **同一个**条目引用（RN 的 popStackEntry 是 indexOf + splice，重造的条目删不掉）
 */
const mockDevice = { os: 'android' as 'android' | 'ios' };
// 用 getter 延迟读：import 会被提升到 const 赋值之前，工厂若直接返回 mockDevice 拿到的是 undefined
jest.mock('@/infra/device', () => ({
    get os() {
        return mockDevice.os;
    },
}));

const mockSetImmersive = jest.fn();
jest.mock('@/infra/systemGates', () => ({
    __esModule: true,
    default: { setImmersiveSystemBars: (v: boolean) => mockSetImmersive(v) },
}));

let mockEntrySeq = 0;
const mockPush = jest.fn((_props: { hidden: boolean }) => ({
    entryId: (mockEntrySeq += 1),
}));
const mockPop = jest.fn((_entry: unknown) => undefined);
jest.mock('react-native', () => ({
    StatusBar: {
        pushStackEntry: (props: { hidden: boolean }) => mockPush(props),
        popStackEntry: (entry: unknown) => mockPop(entry),
    },
}));

import { enterImmersiveSystemBars } from './systemBars';

beforeEach(() => {
    mockSetImmersive.mockClear();
    mockPush.mockClear();
    mockPop.mockClear();
});

it('Android：进入即原生 hide，退出对称 show，不碰 RN StatusBar 栈', () => {
    mockDevice.os = 'android';
    const exit = enterImmersiveSystemBars();
    expect(mockSetImmersive).toHaveBeenCalledTimes(1);
    expect(mockSetImmersive).toHaveBeenCalledWith(true);
    expect(mockPush).not.toHaveBeenCalled();

    exit();
    expect(mockSetImmersive).toHaveBeenCalledTimes(2);
    expect(mockSetImmersive).toHaveBeenLastCalledWith(false);
    expect(mockPop).not.toHaveBeenCalled();
});

it('iOS：push 一条 hidden 条目，退出 pop 的是同一个引用', () => {
    mockDevice.os = 'ios';
    const exit = enterImmersiveSystemBars();
    expect(mockPush).toHaveBeenCalledWith({ hidden: true });
    expect(mockSetImmersive).not.toHaveBeenCalled();

    exit();
    expect(mockPop).toHaveBeenCalledTimes(1);
    // toBe 而非 toHaveBeenCalledWith：后者只查结构相等，重造条目照过
    expect(mockPop.mock.calls[0]?.[0]).toBe(mockPush.mock.results[0]?.value);
});
