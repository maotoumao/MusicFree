/**
 * 栈式 opener 的栈语义：panel 与 fullscreen 共用一个栈，两者行为必须完全一致
 * close 只标 exiting（presence 交给壳播完退场再真卸载），故断言看的是 exiting 标记而非出栈
 */
import { atomStore } from '@/utils/atomStore';

import { defineDialog, defineFullScreen, definePanel } from './opener';
import { dialogAtom, panelsAtom } from './store';

/** 壳不参与本测试，内容组件只需能作为组件被传入 */
const Content = () => null;

function stack() {
    return atomStore.get(panelsAtom);
}

beforeEach(() => {
    atomStore.set(panelsAtom, []);
    atomStore.set(dialogAtom, null);
});

describe('栈式 opener', () => {
    it('panel 与 fullscreen 入同一个栈，各自带上正确的 kind', () => {
        definePanel<number>(Content)(1);
        defineFullScreen<number>(Content)(2);
        expect(stack().map(e => e.kind)).toEqual(['panel', 'fullscreen']);
        expect(stack().map(e => e.payload)).toEqual([1, 2]);
    });

    it('exclusive 先清掉 dialog 与现有栈，再新建实例入栈', () => {
        defineDialog<number>(Content)(0);
        definePanel<number>(Content)(1);
        defineFullScreen<number>(Content)(2, { behavior: 'exclusive' });

        expect(atomStore.get(dialogAtom)?.exiting).toBe(true);
        const entries = stack();
        expect(entries).toHaveLength(2);
        expect(entries[0]?.exiting).toBe(true);
        expect(entries[1]?.kind).toBe('fullscreen');
        expect(entries[1]?.exiting).toBeUndefined();
    });

    it('关闭非栈顶项会自顶向下级联关掉其上方所有项', async () => {
        definePanel<number>(Content)(1);
        const middle = defineFullScreen<number>(Content)(2);
        const top = definePanel<number>(Content)(3);

        middle.close();

        expect(stack().map(e => !!e.exiting)).toEqual([false, true, true]);
        await expect(top).resolves.toBeUndefined();
        await expect(middle).resolves.toBeUndefined();
    });

    it('close 幂等：只结算一次，后续调用被忽略', async () => {
        const handle = defineFullScreen<number, string>(Content)(1);

        handle.close('first');
        handle.close('second');

        await expect(handle).resolves.toBe('first');
        expect(stack().filter(e => !e.exiting)).toHaveLength(0);
    });

    it('栈深上限同时算 panel 与 fullscreen，退场中的不占名额', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const showPanel = definePanel<number>(Content);
        const showFullScreen = defineFullScreen<number>(Content);
        const opened = [
            showPanel(1),
            showFullScreen(2),
            showPanel(3),
            showFullScreen(4),
            showPanel(5),
        ];

        // 满栈时拒开：返回一个已结算、但仍带 close 的 handle，调用方不必特判
        const rejected = showFullScreen(6);
        expect(stack()).toHaveLength(5);
        await expect(rejected).resolves.toBeUndefined();
        expect(typeof rejected.close).toBe('function');

        // 关掉栈顶（只标 exiting、仍留在栈上等退场）后名额即刻腾出
        opened[4]?.close();
        showFullScreen(7);
        expect(stack()).toHaveLength(6);
        expect(stack()[5]?.payload).toBe(7);

        warn.mockRestore();
    });
});
