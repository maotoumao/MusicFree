/**
 * @/native/lyricUtil 桌面端实现
 * 移动端"状态栏歌词"在桌面端对应为桌面歌词悬浮窗(独立 BrowserWindow)。
 * 通过 IPC 驱动主进程 LyricWindowManager。
 */

const bridge = (window as any).__MUSICFREE_DESKTOP__;

export enum NativeTextAlignment {
    LEFT = 3,
    RIGHT = 5,
    CENTER = 17,
}

const LyricUtil = {
    /** 显示桌面歌词悬浮窗 */
    showStatusBarLyric: async (
        initLyric?: string,
        config?: Record<string, any>,
    ): Promise<void> => {
        await bridge.lyric.show(initLyric, config);
    },

    /** 隐藏桌面歌词 */
    hideStatusBarLyric: async (): Promise<void> => {
        await bridge.lyric.hide();
    },

    /** 设置歌词文本 */
    setStatusBarLyricText: async (lyric: string): Promise<void> => {
        await bridge.lyric.setText(lyric);
    },

    /** 设置距顶部百分比 */
    setStatusBarLyricTop: async (percent: number): Promise<void> => {
        await bridge.lyric.setConfig({ topPercent: percent });
    },

    /** 设置距左侧百分比 */
    setStatusBarLyricLeft: async (percent: number): Promise<void> => {
        await bridge.lyric.setConfig({ leftPercent: percent });
    },

    /** 设置宽度百分比 */
    setStatusBarLyricWidth: async (percent: number): Promise<void> => {
        await bridge.lyric.setConfig({ widthPercent: percent });
    },

    /** 设置字号(像素) */
    setStatusBarLyricFontSize: async (fontSize: number): Promise<void> => {
        await bridge.lyric.setConfig({ fontSize });
    },

    /** 设置对齐方式 */
    setStatusBarLyricAlign: async (
        alignment: NativeTextAlignment,
    ): Promise<void> => {
        await bridge.lyric.setConfig({ align: alignment });
    },

    /** 设置文字/背景颜色 */
    setStatusBarColors: async (
        textColor: string | null,
        backgroundColor: string | null,
    ): Promise<void> => {
        await bridge.lyric.setConfig({
            ...(textColor !== null ? { color: textColor } : {}),
            ...(backgroundColor !== null ? { backgroundColor } : {}),
        });
    },

    /** 桌面端无需悬浮窗权限 */
    checkSystemAlertPermission: async () => true,

    requestSystemAlertPermission: async () => true,
};

export default LyricUtil;
