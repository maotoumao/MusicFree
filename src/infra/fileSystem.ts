/**
 * 文件系统机制：文本读取与目录可写性探测
 * 领域无关——「这个目录能不能写」与要往里写什么无关，故归 infra
 */
import { mkdir, read, unlink, writeFile } from '@dr.pogodin/react-native-fs';
import Latin1 from 'crypto-js/enc-latin1';
import Utf8 from 'crypto-js/enc-utf8';

const TEXT_READ_CHUNK_BYTES = 256 * 1024;

async function readUtf8File(path: string, sizeBytes: number): Promise<string> {
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
        throw new Error('Invalid file size');
    }
    const chunks: string[] = [];
    let offset = 0;
    let remaining = '';
    while (offset < sizeBytes) {
        const requested = Math.min(TEXT_READ_CHUNK_BYTES, sizeBytes - offset);
        const bytes = await read(path, requested, offset, 'ascii');
        if (bytes.length === 0 || bytes.length > requested) {
            throw new Error('File length changed while reading');
        }
        offset += bytes.length;
        const content = remaining + bytes;
        let end = content.length;
        if (offset < sizeBytes) {
            let leadIndex = end - 1;
            while (
                leadIndex > 0 &&
                end - leadIndex < 4 &&
                content.charCodeAt(leadIndex) >= 0x80 &&
                content.charCodeAt(leadIndex) <= 0xbf
            ) {
                leadIndex -= 1;
            }
            const lead = content.charCodeAt(leadIndex);
            const width =
                lead >= 0xf0 && lead <= 0xf4
                    ? 4
                    : lead >= 0xe0 && lead <= 0xef
                    ? 3
                    : lead >= 0xc2 && lead <= 0xdf
                    ? 2
                    : 1;
            if (end - leadIndex < width) {
                end = leadIndex;
            }
        }
        remaining = content.slice(end);
        chunks.push(Utf8.stringify(Latin1.parse(content.slice(0, end))));
    }
    return chunks.join('');
}

/**
 * 建出目录并确认真能往里写；任一步失败即 false
 *
 * 光判 `exists` 不够：只读介质、没授权的位置、已拔出的卷都能「存在」，
 * 而失败要等到真写的时候才发生——那时错误往往只能表达成一句「操作失败」。
 * 真写一个文件再删掉，是唯一说得准的办法
 *
 * 探针名带随机段：目标目录可能已经有同名文件（别的应用、上次残留），
 * 固定名会把它覆盖后删掉——探测不该动用户的东西
 */
async function ensureWritableDir(dir: string): Promise<boolean> {
    const probe = `${dir}/.musicfree-write-probe-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
    try {
        await mkdir(dir); // 递归创建；已存在不报错
        await writeFile(probe, 'ok', 'utf8');
    } catch {
        return false;
    }
    // 探针删不掉不影响结论（写成功已经说明可写），但要如实留下这个隐藏文件，
    // 不因为清理失败就否掉整次探测
    await unlink(probe).catch(() => undefined);
    return true;
}

export { ensureWritableDir, readUtf8File };
