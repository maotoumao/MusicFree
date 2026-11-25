/**
 * 兼容各端的 PlaybackError 事件结构：
 * Android 带 message/code，iOS 只带 error（SwiftAudioEx 的报错文案）。
 */
export function getPlaybackErrorMessage(
    e:
        | Partial<{ message?: string; code?: string; error?: string }>
        | null
        | undefined,
) {
    return e?.message || e?.error || "";
}
