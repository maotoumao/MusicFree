/**
 * 下载失败原因：面向用户的分类，不是原生错误码的透传
 *
 * 与 `DownloadErrorCode`（原生桥契约，13 个值）刻意分开：
 * - 原生那套里有多个值对用户是同一件事（capacity / systemLimit / invalidRequest 都只能「重试」）
 * - 失败也可能发生在 JS 侧（插件解析不出音源），原生码里没有它的位置
 * - UI 不该 import 原生桥的枚举
 *
 * 分类标准是**用户据此能做什么**：能换网络、能清空间、能去授权、能换音源的各自单列，
 * 其余一律 unknown——分得再细也不改变他能采取的行动
 *
 * - `network` 连不上或传输中断 → 换个网络重试
 * - `server` 服务端返回错误（非 2xx / Range 响应异常）→ 稍后重试
 * - `sourceUnavailable` 插件给不出可下载地址，或返回的根本不是音频 → 换插件 / 换音质
 * - `diskFull` 存储空间不足 → 清理后重试
 * - `permission` 没有写入权限 → 去授权
 * - `unknown` 其余（本地读写失败、发布失败、原生内部限制等）→ 只能重试
 *
 * **这些字面值随记录写进 MMKV，是持久化 wire**：改名等同于改数据格式，须迁移。
 * 类型与运行时校验都由这一个数组派生，不另维护一份名单
 */
import type { DownloadErrorCode } from '@/native/downloadEngine';

export const DOWNLOAD_FAILURE_REASONS = [
    'network',
    'server',
    'sourceUnavailable',
    'diskFull',
    'permission',
    'unknown',
] as const;

export type DownloadFailureReason = (typeof DOWNLOAD_FAILURE_REASONS)[number];

/**
 * 原生错误码 → 失败原因
 *
 * `satisfies` 锁死覆盖面：原生枚举新增成员而这里没跟上，编译期就会报错。
 * 枚举只以 `import type` 引入，编译后整条 import 被抹掉，不会把原生模块拉进来
 */
const REASON_BY_CODE = {
    network: 'network',
    http: 'server',
    notAudio: 'sourceUnavailable',
    diskFull: 'diskFull',
    permission: 'permission',
    // 以下用户都无从下手，只能重试
    io: 'unknown',
    invalidRequest: 'unknown',
    unsupported: 'unknown',
    capacity: 'unknown',
    targetExists: 'unknown',
    finalize: 'unknown',
    systemLimit: 'unknown',
    unknown: 'unknown',
} satisfies Record<DownloadErrorCode, DownloadFailureReason>;

/**
 * 把原生错误码翻译成失败原因
 *
 * 收 string 而非 `DownloadErrorCode`：桥那边本来就是 `e.code as DownloadErrorCode` 盲转，
 * 运行时可能是任何字符串（尤其原生先于 JS 升级时）。认不出一律 unknown，
 * 宁可少说一句也不要让新码把界面打崩
 */
export function failureReasonOf(code: string): DownloadFailureReason {
    const known: Record<string, DownloadFailureReason | undefined> =
        REASON_BY_CODE;
    return known[code] ?? 'unknown';
}

const REASON_SET = new Set<string>(DOWNLOAD_FAILURE_REASONS);

/** 校验持久化读回的失败原因（系统边界：磁盘数据可被篡改 / 跨版本漂移） */
export function isDownloadFailureReason(
    value: unknown,
): value is DownloadFailureReason {
    return typeof value === 'string' && REASON_SET.has(value);
}
