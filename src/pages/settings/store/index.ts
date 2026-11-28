import { atom } from 'jotai';

import type { SettingsSectionKey } from '../lib/sections';

/**
 * 横屏目录当前选中的分区：模块级 atom，同一会话内再进设置页停在上次的分区
 * 竖屏一列到底、用不到它；竖屏转横屏时「最近滚到的分区」自动选中需要滚动监听，本轮不做（见交接文档遗留）
 */
export const activeSectionAtom = atom<SettingsSectionKey>('playback');
