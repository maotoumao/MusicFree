import { TurboModuleRegistry, type TurboModule } from 'react-native';

import type { EventEmitter } from 'react-native/Libraries/Types/CodegenTypes';

/** 拖动松手后的新纵向锚点（0–1，按安全区内的可移动范围归一化） */
export interface PositionChangeEvent {
    y: number;
}

/** 用户在浮层色条上选定的文字色（取自下发的 textColorOptions） */
export interface TextColorChangeEvent {
    hex: string;
}

/** 用户在浮层步进器上选定的字号 sp（取自下发的 fontSizeSteps） */
export interface FontSizeChangeEvent {
    sp: number;
}

/**
 * 浮层内的文案：可见标签 + 读屏标签
 * 原生不持有任何用户可见文案——App 语言是自己的配置项、与系统语言无关，用 values-* 会两边打架
 */
export interface FloatingLyricLabels {
    /** 应用标记 */
    openApp: string;
    close: string;
    lock: string;
    settings: string;
    play: string;
    pause: string;
    previous: string;
    next: string;
    /** 设置抽屉的「颜色」行标签（可见） */
    textColor: string;
    /** 设置抽屉的「字号」行标签（可见） */
    fontSize: string;
    fontSmaller: string;
    fontLarger: string;
    /** 首次锁定时的原生 Toast（可见） */
    lockedHint: string;
}

/**
 * 浮层渲染配置：core 从 config 组装的跨桥快照
 * 是「已解析的呈现快照」而非配置镜像——core 已按 mode 挑好该形态的值，原生只靠 mode 选内容视图
 * show/update 全量下发，原生 diff 应用（样式/锁定/位置），不含开关决策
 */
export interface FloatingLyricConfig {
    /** 呈现形态 FloatingLyricMode（spec 收裸 string，桥层回填语义类型） */
    mode: string;
    /** 当前字号 sp；core 保证它一定是 fontSizeSteps 中的一项 */
    fontSize: number;
    /** 字号档位表（严格递增、无重复）：原生按当前值的下标画点阵，±一档即取相邻项回传 */
    fontSizeSteps: number[];
    /** 文字色 #RRGGBB / #RRGGBBAA（CSS 顺序、大写十六进制），原生转 ARGB */
    textColor: string;
    /** 色条档位表（同为大写十六进制）：原生逐段绘制；textColor 不在表内时不画选中环 */
    textColorOptions: string[];
    /** 底色浓度 0–0.9（黑底）；何时绘制由形态决定 */
    backgroundOpacity: number;
    /** 是否显示译文 */
    showTranslation: boolean;
    /** 锁定：点击穿透纯展示（原生切 FLAG_NOT_TOUCHABLE）；statusBar 形态恒为 true */
    locked: boolean;
    /** 归一化纵向锚点 0–1 */
    positionY: number;
    /** 浮层内的全部文案（含读屏标签） */
    labels: FloatingLyricLabels;
}

export interface Spec extends TurboModule {
    /** 创建浮层：应用完整快照（样式 + 锁定态 + 初始位置）；重启恢复可能直接为锁定态 */
    show(config: FloatingLyricConfig): Promise<void>;
    /** 销毁浮层 */
    hide(): Promise<void>;
    /** 全量更新样式/锁定/位置到已存在浮层（原生 diff；不动开关） */
    update(config: FloatingLyricConfig): Promise<void>;
    /** 推送当前歌词行（原文必填、译文可空）；高频 fire-and-forget，不 await */
    setLine(original: string, translation: string | null): void;
    /** 推送播放态（决定播放键画 play 还是 pause）；同为内容通道，不 await */
    setPlaying(playing: boolean): void;

    /** 拖动松手 → 新纵向锚点（原生按安全区算，JS 持久化） */
    readonly onPositionChange: EventEmitter<PositionChangeEvent>;
    /** 用户点浮层「锁定」键（JS 决策后经 update 落地） */
    readonly onRequestLock: EventEmitter<void>;
    /** 用户点浮层「关闭」键 */
    readonly onRequestClose: EventEmitter<void>;
    /** 用户点浮层应用标记：原生已把 App 拉到前台，JS 负责落到正在播放页 */
    readonly onRequestOpenApp: EventEmitter<void>;
    /** 用户长按浮层「设置」键：打开 App 内完整设置面板 */
    readonly onRequestOpenSettings: EventEmitter<void>;
    /** 用户点浮层播放/暂停键 */
    readonly onRequestPlayToggle: EventEmitter<void>;
    /** 用户点浮层「下一首」 */
    readonly onRequestSkipToNext: EventEmitter<void>;
    /** 用户点浮层「上一首」 */
    readonly onRequestSkipToPrevious: EventEmitter<void>;
    /** 用户在浮层色条上选色（原生已本地预览，JS 负责持久化） */
    readonly onTextColorChange: EventEmitter<TextColorChangeEvent>;
    /** 用户在浮层步进器上改字号（原生已本地预览，JS 负责持久化） */
    readonly onFontSizeChange: EventEmitter<FontSizeChangeEvent>;
}

// Android-only：用 get（iOS 无此模块，getEnforcing 在 import 期即抛）；桥按平台守卫、Android 缺失暴露
export default TurboModuleRegistry.get<Spec>('NativeFloatingLyric');
