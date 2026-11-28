/**
 * overlay 契约类型（typed opener 模式）
 */
import type { ComponentType } from 'react';

/** overlay 组件收到的 props：payload 入参 + close 终止（带回结果、幂等） */
export interface OverlayProps<I, R = void> {
    payload: I;
    /** 结束自己并结算 Promise（带值/不带值）；首次生效、幂等 */
    close: (result?: R) => void;
}

/** opener 返回：既可 await 拿 R|undefined，也可 .close(result?) 外部命令式关 */
export type OverlayHandle<R> = Promise<R | undefined> & {
    close: (result?: R) => void;
};

/** panel 与 fullscreen 同住一个栈，只是渲染用的壳不同；dialog 是独立单例 lane */
export type OverlayKind = 'dialog' | 'panel' | 'fullscreen';

/** 挂载隐藏的 panel 向内容层暴露的只读状态（隐藏时暂停轮询/重活） */
export interface OverlayStatus {
    /** 可交互且在顶（无 dialog 压顶）：可接管返回键、跑重活 */
    readonly active: boolean;
    /** 内容在前台（最顶未退场 panel，被 dialog 压住也算）——供内容判断是否暂停轮询/重活，非严格视觉可见 */
    readonly visible: boolean;
    /** 进场动画是否已放完：内容层据此把重活（大列表等）推迟到开场后再渲染，避免压卡进场（非面板内容默认 true） */
    readonly entered: boolean;
}

export interface OverlayOptions {
    /** 环境手势（返回键 + backdrop）能否关闭；false = 必须显式决策。默认 true */
    dismissible?: boolean;
    /** backdrop 视觉效果；默认仅显示遮罩，blur 会模糊底层导航内容并叠深色遮罩 */
    backdropEffect?: 'blur';
    /** 调试名（非契约，仅诊断枚举用） */
    debugName?: string;
}

/** Panel 壳专属注册选项（Dialog / FullScreen 不适用；与「打开行为」OverlayOpenOptions 分开） */
export interface PanelOptions extends OverlayOptions {
    /**
     * 竖屏 Panel 的键盘避让行为，默认 'avoid'
     * - 'avoid'：键盘弹起时面板避让（整体上移；长面板另收缩 maxHeight 防标题顶出）——输入框在底部/中部时用
     * - 'overlap'：面板不避让（位置/高度全不变）、键盘覆盖其下部——顶部输入 + 下方可滚动内容时用（输入本在键盘上方无需移动、零高度跳变；下方滚动列表需自加键盘 inset 保证被盖项可滚到）
     */
    keyboardBehavior?: 'avoid' | 'overlap';
}

/**
 * 栈式 overlay（panel / fullscreen 共用一个栈）的打开行为
 * - 'stack'：叠加到栈顶（默认）
 * - 'exclusive'：先关掉所有阻断层（dialog + 现有栈）再入栈；总是新建实例，不复用已在栈上的同类
 */
export interface OverlayOpenOptions {
    behavior?: 'stack' | 'exclusive';
}

/** 活动 overlay 实例（store 内部；Component/payload/close 已擦除具体 I/R） */
export interface OverlayInstance {
    readonly id: string;
    readonly kind: OverlayKind;
    readonly Component: ComponentType<{
        payload: unknown;
        close: (result?: unknown) => void;
    }>;
    readonly payload: unknown;
    /** 关闭并结算（id 绑定、幂等） */
    readonly close: (result?: unknown) => void;
    readonly options?: OverlayOptions;
    /** presence：close 后置真——壳播完退场动画再 remove 真卸载（绕开声明式 exiting 的 Fabric 白闪） */
    readonly exiting?: boolean;
}
