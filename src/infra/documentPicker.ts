/** 系统文件选择器：包 expo-document-picker，选单个文件并复制到 app cache，返回可立即读取的 file:// URI */
import { readFile, stat } from '@dr.pogodin/react-native-fs';
import { getDocumentAsync } from 'expo-document-picker';

/** 选中的文件 */
export interface PickedFile {
    /** 复制到 app cache 的 file:// URI，供当前流程立即读取（cache 可能被系统清理，勿长期持有） */
    uri: string;
    /** 原始文件名，含扩展名 */
    name: string;
}

/** 打开系统文件选择器选单个文件并复制到 app cache；用户取消返回 undefined */
export async function pickFile(options?: {
    /** 允许的 MIME 类型，缺省不限类型 */
    types?: string[];
}): Promise<PickedFile | undefined> {
    const result = await getDocumentAsync({
        type: options?.types,
        copyToCacheDirectory: true,
        multiple: false,
    });
    if (result.canceled) {
        return undefined;
    }
    const asset = result.assets[0];
    // 成功结果缺 asset 违反 SDK 契约（原生回归），显式抛出而非静默当取消
    if (!asset) {
        throw new Error('文件选择器未返回所选文件');
    }
    return { uri: asset.uri, name: asset.name };
}

/** 选中的文本文件 */
export interface PickedText {
    /** 原始文件名，含扩展名 */
    name: string;
    /** 按 UTF-8 解码的全文；不做编码猜测，调用方自行判断结果是否可用 */
    text: string;
}

/**
 * 选一个文件并按 UTF-8 读出全文；用户取消返回 undefined
 *
 * `maxBytes` 是必要的护栏：选择器不限类型时用户可能误选几百 MB 的视频，
 * 整份读进 JS 会连着缓存复制、过桥与内存峰值一起爆。超限按读取失败抛出
 */
export async function pickTextFile(options?: {
    types?: string[];
    maxBytes?: number;
}): Promise<PickedText | undefined> {
    const picked = await pickFile({ types: options?.types });
    if (!picked) {
        return undefined;
    }
    const maxBytes = options?.maxBytes;
    if (maxBytes !== undefined) {
        const { size } = await stat(picked.uri);
        if (size > maxBytes) {
            throw new Error(`文件过大：${size} > ${maxBytes}`);
        }
    }
    return { name: picked.name, text: await readFile(picked.uri, 'utf8') };
}
