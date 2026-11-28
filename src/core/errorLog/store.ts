/**
 * 错误记录的反应式镜像：ErrorLog 通过 setErrorRecords 发布，错误日志页读取
 * 与其他 store 一致经 uiMirror 发布——后台不写 atom、回前台一次刷入
 */
import { atom } from 'jotai';

import { publishToUi } from '@/infra/uiMirror';

import type { ErrorRecord } from './types';

const EMPTY: readonly ErrorRecord[] = Object.freeze([]);

export const errorRecordsAtom = atom<readonly ErrorRecord[]>(EMPTY);

export function setErrorRecords(records: readonly ErrorRecord[]): void {
    publishToUi(errorRecordsAtom, records);
}
