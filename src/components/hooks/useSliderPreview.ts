/**
 * 滑杆旁边那个数值标签的实时值
 *
 * 滑杆是受控的，而受控值常常等松手才更新（要落库、要烘焙、要过 core），
 * 于是整个拖动过程里标签一动不动——手在动、数字不动，看着像卡死了。
 *
 * 这里只管**显示**：拖动期间用手势值，受控值追上来之后再交还它。
 * 不碰提交语义——真正的写入仍然只发生在 `onChangeEnd`。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface SliderPreviewHandlers {
    /** 拖动实时值（照常透传给调用方，比如同步写 shared value） */
    onChange?: (value: number) => void;
    /** 松手 / 点按提交 */
    onChangeEnd?: (value: number) => void;
    /** 被父手势抢占 */
    onChangeCancel?: () => void;
}

export interface SliderPreview extends Required<SliderPreviewHandlers> {
    /** 拖动中为手势值，否则为受控值——**仅供显示**，不要拿去提交 */
    displayValue: number;
}

/**
 * @param value 受控值
 * @param handlers 调用方自己的回调，原样透传
 */
export function useSliderPreview(
    value: number,
    handlers: SliderPreviewHandlers = {},
): SliderPreview {
    const [preview, setPreview] = useState<number | null>(null);
    // 与 `useSlider` 的 draggingRef 同构：手上有手势时，受控值的变动不许打断预览
    const draggingRef = useRef(false);

    // 受控值一变就交还它。反过来若按 onChangeEnd 清预览，异步提交（落库 / 烘焙）会让标签
    // 先跳回旧值再跳回来。
    //
    // 拖动期间必须让路：`useSlider` 的 posFrac 回写同样挡了 draggingRef（useSlider.ts:127），
    // 这里不挡的话，外部在拖动中改了受控值（背景烘焙落库会重置 scale、visibility 直接读 core）
    // 就会出现拇指跟手、数字却闪回受控值一帧的割裂。
    //
    // 提交若一直不落（写失败、调用方不更新受控值），预览就停在用户拖到的值——这也是对的：
    // posFrac 同样只在 targetFrac 变化时才回落，此时拇指也停在原处。两者同一条规则，
    // 标签始终跟着拇指走。（无障碍加减档只调 onChangeEnd、不经手势，那条路上标签会比拇指
    // 早一步到位，等受控值传播过来两者才合拢——短暂领先，不是分叉）
    useEffect(() => {
        if (draggingRef.current) {
            return;
        }
        setPreview(null);
    }, [value]);

    // latest ref：返回的回调身份恒定，拖动中不会因为内联闭包把 memo 过的 Slider 顶掉重渲
    const latest = useRef(handlers);
    latest.current = handlers;

    const onChange = useCallback((next: number) => {
        draggingRef.current = true;
        setPreview(next);
        latest.current.onChange?.(next);
    }, []);
    const onChangeEnd = useCallback((next: number) => {
        // 点按定位不走 onChange，只有这里能拿到值；同样不清预览，等受控值追上
        draggingRef.current = false;
        setPreview(next);
        latest.current.onChangeEnd?.(next);
    }, []);
    const onChangeCancel = useCallback(() => {
        draggingRef.current = false;
        setPreview(null);
        latest.current.onChangeCancel?.();
    }, []);

    return {
        displayValue: preview ?? value,
        onChange,
        onChangeEnd,
        onChangeCancel,
    };
}
