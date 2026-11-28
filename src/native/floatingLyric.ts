/**
 * 悬浮歌词原生桥适配层：包裹裸 codegen spec（`./specs/NativeFloatingLyric`）。
 * 纯桥、无副作用——只做「事件解包成 Unsubscribe / Promise 收口 / 裸 string 回填语义类型」。
 * 正式代码经 core/floatingLyric 用，禁直接 import `./specs`。业务（取行/开关/权限/持久化）留 core
 * Android-only：非 Android 桥为 no-op；Android 缺模块（注册/打包错误）调用时抛错暴露、不静默
 */
import { Platform } from 'react-native';

import Native from './specs/NativeFloatingLyric';

import type { FloatingLyricConfig as SpecConfig } from './specs/NativeFloatingLyric';
import type { FloatingLyricMode } from '@/types';
import type { EventEmitter } from 'react-native/Libraries/Types/CodegenTypes';

// 文案 DTO 无需回填语义类型，直接 re-export（不重定义，避免第二真相源）
export type { FloatingLyricLabels } from './specs/NativeFloatingLyric';

export type Unsubscribe = () => void;

/** 跨桥快照：字段以 spec 为单一真相，只把裸 string 的 mode 回填成语义类型 */
export type FloatingLyricConfig = Omit<SpecConfig, 'mode'> & {
    mode: FloatingLyricMode;
};

const supported = Platform.OS === 'android';
const noop: Unsubscribe = () => {};

/** Android 上取原生模块；缺失（注册/打包错误）抛错暴露，不静默 */
function requireNative(): NonNullable<typeof Native> {
    if (!Native) {
        throw new Error(
            'NativeFloatingLyric 未注册：Android 期望存在此 TurboModule',
        );
    }
    return Native;
}

/** 无参事件的统一解包：非 Android 直接 no-op */
function subscribeVoid(
    pick: (native: NonNullable<typeof Native>) => EventEmitter<void>,
    cb: () => void,
): Unsubscribe {
    if (!supported) {
        return noop;
    }
    const sub = pick(requireNative())(() => cb());
    return () => sub.remove();
}

/** 悬浮歌词浮层桥把手：Android 透传原生 + 事件解包；非 Android no-op */
export const floatingLyric = {
    show: (config: FloatingLyricConfig): Promise<void> =>
        supported ? requireNative().show(config) : Promise.resolve(),
    hide: (): Promise<void> =>
        supported ? requireNative().hide() : Promise.resolve(),
    update: (config: FloatingLyricConfig): Promise<void> =>
        supported ? requireNative().update(config) : Promise.resolve(),
    setLine: (original: string, translation: string | null): void => {
        if (supported) {
            requireNative().setLine(original, translation);
        }
    },
    setPlaying: (playing: boolean): void => {
        if (supported) {
            requireNative().setPlaying(playing);
        }
    },

    onPositionChange: (cb: (y: number) => void): Unsubscribe => {
        if (!supported) {
            return noop;
        }
        const sub = requireNative().onPositionChange(e => cb(e.y));
        return () => sub.remove();
    },
    onTextColorChange: (cb: (hex: string) => void): Unsubscribe => {
        if (!supported) {
            return noop;
        }
        const sub = requireNative().onTextColorChange(e => cb(e.hex));
        return () => sub.remove();
    },
    onFontSizeChange: (cb: (sp: number) => void): Unsubscribe => {
        if (!supported) {
            return noop;
        }
        const sub = requireNative().onFontSizeChange(e => cb(e.sp));
        return () => sub.remove();
    },

    onRequestLock: (cb: () => void): Unsubscribe =>
        subscribeVoid(n => n.onRequestLock, cb),
    onRequestClose: (cb: () => void): Unsubscribe =>
        subscribeVoid(n => n.onRequestClose, cb),
    onRequestOpenApp: (cb: () => void): Unsubscribe =>
        subscribeVoid(n => n.onRequestOpenApp, cb),
    onRequestOpenSettings: (cb: () => void): Unsubscribe =>
        subscribeVoid(n => n.onRequestOpenSettings, cb),
    onRequestPlayToggle: (cb: () => void): Unsubscribe =>
        subscribeVoid(n => n.onRequestPlayToggle, cb),
    onRequestSkipToNext: (cb: () => void): Unsubscribe =>
        subscribeVoid(n => n.onRequestSkipToNext, cb),
    onRequestSkipToPrevious: (cb: () => void): Unsubscribe =>
        subscribeVoid(n => n.onRequestSkipToPrevious, cb),
};
