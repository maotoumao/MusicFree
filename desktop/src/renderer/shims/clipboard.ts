/**
 * @react-native-clipboard/clipboard 桌面端实现
 * 使用 navigator.clipboard(Electron 渲染进程中可用,无权限限制)。
 */

const Clipboard = {
    async getString(): Promise<string> {
        try {
            const text = await navigator.clipboard.readText();
            return text ?? "";
        } catch {
            return "";
        }
    },

    setString(content: string): void {
        if (typeof content !== "string") return;
        try {
            navigator.clipboard?.writeText?.(content).catch(() => {});
        } catch {
            // ignore
        }
    },

    // 兼容新 API
    setStringSync(content: string): void {
        if (typeof content !== "string") return;
        try {
            navigator.clipboard?.writeText?.(content).catch(() => {});
        } catch {
            // ignore
        }
    },
};

export default Clipboard;
