/**
 * react-native-image-picker 桌面端实现
 * 通过 IPC 调用 Electron 原生文件选择对话框。
 */

interface PickerAsset {
    uri: string;
    fileName?: string;
    fileSize?: number;
    type?: string;
    width?: number;
    height?: number;
}

interface ImagePickerResponse {
    didCancel: boolean;
    assets?: PickerAsset[];
    errorCode?: string;
    errorMessage?: string;
}

const bridge = (window as any).__MUSICFREE_DESKTOP__;

const mimeByExt: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
};

function extOf(p: string): string {
    const i = p.lastIndexOf(".");
    return i === -1 ? "" : p.slice(i + 1).toLowerCase();
}

async function pickImage(): Promise<ImagePickerResponse> {
    const result = await bridge.dialog.pickImage();
    if (!result) return { didCancel: true };
    const ext = extOf(result.path);
    return {
        didCancel: false,
        assets: [
            {
                uri: result.path,
                fileName: result.name,
                type: mimeByExt[ext] ?? "image/jpeg",
            },
        ],
    };
}

export async function launchImageLibrary(_options?: any): Promise<ImagePickerResponse> {
    return pickImage();
}

export async function launchCamera(_options?: any): Promise<ImagePickerResponse> {
    // 桌面端无摄像头,视作取消
    return { didCancel: true };
}

export default {
    launchImageLibrary,
    launchCamera,
};
