/** 秒 → `mm:ss`（分秒各两位补零；满 1 小时则 `h:mm:ss`）；非法/负值回退 `00:00` */
export function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '00:00';
    }
    const total = Math.floor(seconds);
    const s = String(total % 60).padStart(2, '0');
    const m = String(Math.floor(total / 60) % 60).padStart(2, '0');
    const h = Math.floor(total / 3600);
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

/**
 * 秒 → 文字标签用的时长：同 `formatDuration` 但不补前导零（「3:12」而非「03:12」）
 * 进度条那种需要定宽读数的场景仍用 `formatDuration`，避免数字左右跳动
 */
export function formatDurationLabel(seconds: number): string {
    return formatDuration(seconds).replace(/^0/, '');
}
