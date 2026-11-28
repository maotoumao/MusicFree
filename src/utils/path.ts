/**
 * 文件路径的纯计算：目录包含关系判定
 * 一律按**路径段边界**比对——裸前缀比对会让 /Music 误命中 /MusicBackup，
 * 而这类判定同时用在「排除目录」「扫描根」「下载目录归属」上，误命中就是误扫或误删
 */

/** 拼给前缀比对用的目录前缀；根目录自带分隔符，再拼一个会变成 '//' 而谁都不匹配 */
function dirPrefix(dir: string): string {
    return dir === '/' ? '/' : dir + '/';
}

/** path 是否严格落在 dir 之内（dir 自身不算） */
export function isUnderDir(path: string, dir: string): boolean {
    return path.startsWith(dirPrefix(dir));
}

/** path 是否等于 dir 或落在其中 */
export function isAtOrUnderDir(path: string, dir: string): boolean {
    return path === dir || path.startsWith(dirPrefix(dir));
}

/**
 * 去掉尾部斜杠（根 '/' 保留原样）
 * 目录要参与前缀比对与拼接，形态必须稳定：'/a/b/' 与 '/a/b' 得是同一个目录
 */
export function stripTrailingSlash(path: string): string {
    if (path.length <= 1 || !path.endsWith('/')) {
        return path;
    }
    // 全是斜杠（'//'）时不能退化成空串：空串当目录前缀是「谁都在它之下」的万能匹配
    return path.replace(/\/+$/, '') || '/';
}

/**
 * 规范化一个「目录」路径：绝对且有实际路径段才算数，返回去掉尾斜杠的形式；否则 null
 *
 * 抽在这里而不是留在 core/download：下载目录的形态判据既要给 `downloadPath` 用，
 * 也要给 registry 的持久化洗值用，而后者是纯持久化层、不该为一个字符串判据把
 * `infra/paths`（连着 react-native-fs）拖进依赖里
 */
export function normalizeAbsoluteDir(path: string): string | null {
    const trimmed = path.trim();
    if (!trimmed.startsWith('/')) {
        return null;
    }
    const stripped = stripTrailingSlash(trimmed);
    return stripped.length > 1 ? stripped : null;
}

/** Android 主存储常见的历史/快捷符号链接前缀 → 标准挂载路径 */
const ANDROID_PRIMARY_STORAGE = '/storage/emulated/0';
const ANDROID_STORAGE_ALIASES: readonly string[] = [
    '/sdcard',
    '/mnt/sdcard',
    '/storage/sdcard0',
];

/**
 * 剥离可选的 `file://` 前缀；已是裸路径则原样返回。
 * 不做 `decodeURIComponent`：旧版 v0.6.x 锚点直接拼 `'file://' + rawPath`（未经百分号编码），
 * 新版只存裸路径；盲目解码会把真实文件名里的 `%25`、`%20` 误改写成另一份文件名
 */
export function stripFileScheme(path: string): string {
    return path.replace(/^file:\/\//i, '');
}

/**
 * 生成用于「是否同一本地文件」比对的规范键（仅用于等价比较，不替代原始路径展示或读写）：
 * 剥离 `file://`、去尾斜杠，并将 `/sdcard/...` 等主存储别名按段边界对齐到 `/storage/emulated/0/...`
 */
export function filePathKey(path: string): string {
    const bare = stripTrailingSlash(stripFileScheme(path.trim()));
    for (const alias of ANDROID_STORAGE_ALIASES) {
        if (isAtOrUnderDir(bare, alias)) {
            return ANDROID_PRIMARY_STORAGE + bare.slice(alias.length);
        }
    }
    return bare;
}

/** 两个路径字符串（含 `file://` 或 `/sdcard` 别名差异）是否指向同一本地文件位置 */
export function isSameFilePath(a: string, b: string): boolean {
    return a === b || filePathKey(a) === filePathKey(b);
}
