/**
 * 兜底页的复制动作
 *
 * 单独抽出来是因为两级兜底页共用它，而且**它必须永不抛**：
 * 事件回调里的异常不由错误边界捕获，装配前 `errorLog` 更可能还没换成真实现。
 * 任何一步失败都退回「原始错误文本」——有总比什么都复制不到强
 */
import { errorLog } from '@/core/errorLog';
import { copyText } from '@/infra/clipboard';

function rawText(error: Error): string {
    return `${error.name}: ${error.message}\n${error.stack ?? ''}`;
}

export function copy(error: Error): void {
    let report: string;
    try {
        const [latest] = errorLog.getRecords();
        report = (latest && errorLog.formatReport(latest.id)) || rawText(error);
    } catch {
        report = rawText(error);
    }
    copyText(report).catch(() => {});
}
