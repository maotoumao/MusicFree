/** 浮层层级 */
export const zIndex = {
    base: 0,
    dropdown: 1000,
    sticky: 1100,
    /** 被压制的 panel（被 dialog 压暗 / 被子面板盖住）——落在 backdrop 之下 */
    panelSuppressed: 1200,
    /** 共享遮罩层（夹在被压 panel 与最顶可见 panel 之间） */
    backdrop: 1250,
    /** 最顶可见 panel（active，正常态，压在遮罩之上） */
    panel: 1280,
    modal: 1300,
    toast: 1400,
} as const;
