/**
 * live 插件列表唯一真相源：platform → Plugin（已装插件，不含内建「本地」）
 * Manager 经 setPlugins 换整个 Map（禁原地 mutate 复用引用）；React 侧 hooks 订阅（2d）
 */
import { atom } from 'jotai';

import { atomStore } from '@/utils/atomStore';

import type { Plugin } from './types';

export const pluginsAtom = atom<ReadonlyMap<string, Plugin>>(new Map());

/** 读当前插件表（Manager / React 外用；React 侧走 hooks）；只读，改动须经 setPlugins 换整表 */
export function getPlugins(): ReadonlyMap<string, Plugin> {
    return atomStore.get(pluginsAtom);
}

/** 发布新插件表（传入须是新 Map，触发订阅重渲染） */
export function setPlugins(next: ReadonlyMap<string, Plugin>): void {
    atomStore.set(pluginsAtom, next);
}
