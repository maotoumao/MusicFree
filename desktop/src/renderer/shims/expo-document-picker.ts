/**
 * expo-document-picker 桌面端实现
 * 通过 IPC 调用 Electron 原生文件选择对话框。
 */

const bridge = (window as any).__MUSICFREE_DESKTOP__;

interface DocumentResult {
    canceled: boolean;
    assets?: {
        uri: string;
        name: string;
        size?: number;
        mimeType?: string;
    }[];
}

export async function getDocumentAsync(options?: {
    type?: string | string[];
    multiple?: boolean;
    copyToCacheDirectory?: boolean;
}): Promise<DocumentResult> {
    // 把 mime type 转换为扩展名过滤(有限支持)
    const mimeMap: Record<string, string[]> = {
        "application/json": ["json"],
        "text/*": ["txt", "lrc", "md", "json"],
        "*/*": [],
    };
    const type = options?.type;
    let extensions: string[] | undefined;
    if (typeof type === "string" && mimeMap[type]) {
        extensions = mimeMap[type].length ? mimeMap[type] : undefined;
    }

    const result = await bridge.dialog.pickFile(extensions);
    if (!result) {
        return { canceled: true };
    }
    return {
        canceled: false,
        assets: [
            {
                uri: result.path,
                name: result.name,
            },
        ],
    };
}

export default { getDocumentAsync };
