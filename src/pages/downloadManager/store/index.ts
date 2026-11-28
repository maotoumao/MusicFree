/**
 * 下载管理页的页面态：当前筛选面
 *
 * 放模块级 atom 而非组件 state：设计要求「返回后保留最后选中的筛选」，
 * 页面卸载重进要能接上；只活在内存，不必持久化到磁盘
 */
import { atom } from 'jotai';

import type { ActiveDownloadFilter } from '@/core/download';

/** 「已完成」不在活动队列里（它由本地音乐库提供），故比 core 的筛选面多一档 */
export type DownloadPane = ActiveDownloadFilter | 'completed';

/** 未选过时为 undefined：首次进入按「最需要处理的非空状态」自动落位 */
export const selectedPaneAtom = atom<DownloadPane | undefined>(undefined);
