/**
 * 响应式判据（DP）
 *
 * 两个**正交**的阈值，分别回答「有多宽」与「有多高」：
 * - tabletMinEdge：窗口**最小边** ≥ 它才算平板（等价于 Android 的 sw600dp）。
 *   用最小边而不用宽度，是为了让手机横屏（如 915 × 412）仍落在手机分支——
 *   「手机体验与今天一致」是本 App 平板适配的不变量。
 *   由 hooks/useLayoutClass 消费；平板再按宽高比分竖 / 横。
 * - compactHeight：窗口高 < 它即矮窗，chrome 换矮档、内容列不再限宽。
 *   由 hooks/useCompactHeight 消费。
 */
export const breakpoints = {
    /** 窗口最小边 ≥ 此进平板（折叠屏展开 / 平板 / 平板分屏一半） */
    tabletMinEdge: 600,
    /**
     * 窗口高 < 此进「矮窗」档（等价于 Android window size class 的 height COMPACT）
     *
     * 与 tabletMinEdge 是**互不相干的两问**：前者问「有多宽、能不能分栏」，后者问
     * 「有多高、chrome 还付得起吗」。手机横屏（780 × 360）两问的答案相反——
     * 按最小边它是 phone，但它的宽其实比平板竖屏还富裕、高却只有竖屏的一半。
     * 只用一个判据时，横屏拿到的就是「竖屏布局被横过来」。
     */
    compactHeight: 480,
} as const;
