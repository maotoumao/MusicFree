import { atom } from 'jotai';

import type { LocalCollectionView, LocalMusicView } from '@/core/localMusic';

/**
 * 有库时的 Tab 选择态（全部 / 文件夹 / 专辑 / 艺术家）
 * 提到页级是因为顶栏也要读它：仅「全部」页有整库可搜，搜索按钮随之出现/消失
 * 重扫不重置；离开本地音乐页时复位
 */
export const libraryViewAtom = atom<LocalMusicView>('all');

/**
 * 有库时从更多菜单点「重新扫描」→ 显示扫描控制台重扫态覆盖列表（旧库仍在内存、播放不断）
 * 放弃重扫 / 开始扫描时清零；进入扫描由 LocalMusicLibrary 的 scanning effect 兜底清
 */
export const rescanRequestedAtom = atom(false);

/** 选中的集合：视图 + 稳定 key + 展示标题（形状归 store，不放在展示组件里） */
export interface SelectedCollection {
    view: LocalCollectionView;
    /** 集合稳定 key：文件夹 path / 专辑复合 key / 艺术家名 */
    collectionKey: string;
    title: string;
}

/**
 * 横屏分栏下当前选中的集合；null = 还没选（右栏给引导空态）
 *
 * 只在 panes 形态有意义：竖屏点集合仍是压栈到 LocalCollectionDetail。
 * 切换左栏视图时置 null——在「专辑」里选中的集合到了「艺术家」下无从解释
 */
export const selectedCollectionAtom = atom<SelectedCollection | null>(null);
