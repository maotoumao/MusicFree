/**
 * @/native/utils 桌面端实现
 * exitApp → IPC 关闭应用;权限检查在桌面端恒为通过。
 */

const bridge = (window as any).__MUSICFREE_DESKTOP__;

const NativeUtils = {
    exitApp: () => {
        bridge?.app?.quit?.();
    },

    checkStoragePermission: async () => true,

    requestStoragePermission: () => {},

    getWindowDimensions: () => ({
        width: window.innerWidth,
        height: window.innerHeight,
    }),
};

export default NativeUtils;
