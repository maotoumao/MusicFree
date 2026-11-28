import { act, create } from 'react-test-renderer';

import { useLayoutClass } from './useLayoutClass';

type Listener = () => void;
// jest.mock 工厂只允许引用 mock 前缀的外部变量
const mockListeners = new Set<Listener>();
const mockRemove = jest.fn(() => mockListeners.clear());
const mockWindow = { width: 390, height: 844 };

jest.mock('react-native', () => ({
    Dimensions: {
        get: () => ({ ...mockWindow }),
        addEventListener: (_: string, listener: Listener) => {
            mockListeners.add(listener);
            return { remove: mockRemove };
        },
    },
}));
jest.mock('@/design', () => ({
    breakpoints: jest.requireActual('@/design/tokens/breakpoints').breakpoints,
}));

const renders: string[] = [];
function Probe() {
    const layoutClass = useLayoutClass();
    renders.push(layoutClass);
    return null;
}

function resize(width: number, height: number) {
    mockWindow.width = width;
    mockWindow.height = height;
    act(() => {
        mockListeners.forEach(listener => listener());
    });
}

beforeEach(() => {
    renders.length = 0;
    mockRemove.mockClear();
    mockWindow.width = 390;
    mockWindow.height = 844;
});

describe('useLayoutClass 订阅生命周期', () => {
    it('同类别的尺寸变化不触发重渲；跨类别才重渲', () => {
        let root: ReturnType<typeof create> | undefined;
        act(() => {
            root = create(<Probe />);
        });
        expect(renders).toEqual(['phone']);

        // 手机旋转 / 分屏拖动：仍是 phone，不重渲
        resize(844, 390);
        resize(412, 450);
        expect(renders).toEqual(['phone']);

        // 折叠屏展开：跨到平板竖屏，重渲一次
        resize(775, 930);
        expect(renders).toEqual(['phone', 'tabletPortrait']);

        // 平板分屏拖分割线：宽度连续变、类别不变
        resize(700, 930);
        resize(650, 930);
        expect(renders).toEqual(['phone', 'tabletPortrait']);

        resize(930, 775);
        expect(renders).toEqual(['phone', 'tabletPortrait', 'tabletLandscape']);

        act(() => {
            root?.unmount();
        });
        expect(mockRemove).toHaveBeenCalledTimes(1);
    });

    it('挂载时按当前窗口取初值', () => {
        mockWindow.width = 1280;
        mockWindow.height = 800;
        act(() => {
            create(<Probe />);
        });
        expect(renders[0]).toBe('tabletLandscape');
    });
});
