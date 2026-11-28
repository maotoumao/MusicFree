/**
 * 搜索页会话态（本页私有 atoms，模块级；index 卸载时重置）
 */
import { atom } from 'jotai';

/** 搜索阶段：编辑（输入 + 历史）| 结果（真实结果列表） */
export type SearchPhase = 'editing' | 'result';

/** 输入框草稿 */
export const draftQueryAtom = atom('');
/** 当前阶段 */
export const phaseAtom = atom<SearchPhase>('editing');
/** 已提交关键词（驱动结果查询） */
export const submittedQueryAtom = atom('');
