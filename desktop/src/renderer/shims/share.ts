/**
 * react-native-share 桌面端实现
 * 桌面端语义:文本复制到剪贴板 / 图片另存,弹出提示。
 * 项目内唯一调用点是分享带二维码的图片(navBar.tsx),
 * 桌面端降级为把 message 写入剪贴板。
 */

import Clipboard from "./clipboard";

interface ShareOptions {
    title?: string;
    message?: string;
    url?: string;
    subject?: string;
    type?: string;
}

function saveDataUrl(dataUrl: string, filename: string) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

const Share = {
    async open(options: ShareOptions): Promise<any> {
        try {
            if (typeof options.url === "string" && options.url.startsWith("data:")) {
                // data URL 图片 → 触发另存为
                saveDataUrl(options.url, `musicfree-share.${options.type?.split("/")[1] ?? "png"}`);
                return { success: true };
            }
            const text = options.message ?? options.url ?? "";
            if (text) {
                Clipboard.setString(text);
            }
            return { success: true };
        } catch {
            return { success: false };
        }
    },

    async shareSingle(_options: ShareOptions): Promise<any> {
        return Share.open(_options);
    },
};

export default Share;
