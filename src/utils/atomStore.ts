import { getDefaultStore } from 'jotai';

/**
 * 全局 atom store：core 单例在 React 外读写 atom（atomStore.get / atomStore.set）
 * 用 jotai 默认 store（不 createStore）；因此 app provider 树不加 jotai Provider
 */
export const atomStore = getDefaultStore();
