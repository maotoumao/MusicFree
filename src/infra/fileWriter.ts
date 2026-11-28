/**
 * 增量写文本文件：调用方按任意粒度喂片，内部攒批后成批落盘
 * 攒批是必要的——rn-fs 每次 append 都要把文本转 base64、过桥、在原生侧重开文件句柄，
 * 逐片直落会让「几十万次小写」慢到不可用
 */
import { appendFile, stat, writeFile } from '@dr.pogodin/react-native-fs';

/** 攒够多少字符才落盘一次；只是批量启发值，不需要与字节数精确对应 */
const FLUSH_THRESHOLD = 64 * 1024;

export interface TextFileWriter {
    /** 追加一段文本；write 与 close 都必须串行 await，不可并发调用 */
    write(text: string): Promise<void>;
    /** 结束写入（冲刷余料），返回文件的字节数；可重复调用，返回同一结果 */
    close(): Promise<number>;
}

/**
 * 打开一个文本文件用于增量写入，已存在则截断
 * 写入期间文件内容是不完整的，需要原子性的场景应先写临时文件、完成后再移到目的地
 * 任一次落盘失败即作废整个写入器：原生侧可能已写入部分字节且无从得知写了多少，重试会丢数据或写重
 */
export function createTextFileWriter(path: string): TextFileWriter {
    const pending: string[] = [];
    let pendingLength = 0;
    // 首次落盘已完成（文件已截断/创建），此后改用 append
    let truncated = false;
    let failure: { readonly error: unknown } | undefined;
    let closedSize: number | undefined;

    async function drain(isFinal: boolean): Promise<void> {
        if (pending.length === 0) {
            return;
        }
        let text = pending.join('');
        pending.length = 0;
        pendingLength = 0;

        if (!isFinal) {
            const lastCode = text.charCodeAt(text.length - 1);
            // 末尾若是高代理项就留给下一批：代理对若被拆进两次编码，两半会各自变成 U+FFFD
            if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
                pending.push(text.slice(-1));
                pendingLength = 1;
                text = text.slice(0, -1);
            }
        }
        if (text === '') {
            return;
        }

        try {
            if (truncated) {
                await appendFile(path, text, 'utf8');
            } else {
                await writeFile(path, text, 'utf8');
                truncated = true;
            }
        } catch (error) {
            failure = { error };
            throw error;
        }
    }

    return {
        async write(text) {
            if (failure) {
                throw failure.error;
            }
            if (closedSize !== undefined) {
                throw new Error('TextFileWriter 已关闭，不能继续写入');
            }
            pending.push(text);
            pendingLength += text.length;
            if (pendingLength >= FLUSH_THRESHOLD) {
                await drain(false);
            }
        },
        async close() {
            if (failure) {
                throw failure.error;
            }
            if (closedSize !== undefined) {
                return closedSize;
            }
            await drain(true);
            if (!truncated) {
                // 一片都没写过时仍要产出（截断出）空文件
                await writeFile(path, '', 'utf8');
                truncated = true;
            }
            const { size } = await stat(path);
            closedSize = size;
            return size;
        },
    };
}
