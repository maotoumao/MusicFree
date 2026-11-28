import { TurboModuleRegistry, type TurboModule } from 'react-native';

import type { EventEmitter } from 'react-native/Libraries/Types/CodegenTypes';

/* 跨桥字段用 string/number/boolean/数组；codegen 不支持字符串字面量 union，故 code 用 string */

/**
 * 原生 TagLib 扫描出的一个音频文件（纯数据；core 组装成 MusicItem）
 * 性能：id 由原生算、封面只给标志（内容懒取）
 * 标签无法解析的畸形文件：title 回退文件名、其余文本空且 durationMs=0（仍入库、不丢歌）
 */
export interface ScannedAudioFile {
    /** 稳定身份=canonical 绝对路径的 UTF-8 字节 MD5、小写 32 位 hex（原生算、算法冻结） */
    id: string;
    /** canonical 绝对路径；core 经 URI 编码拼 file://（含 # ? % 的文件名要编码、不裸拼） */
    path: string;
    title: string;
    artist: string;
    album: string;
    /** 专辑艺术家（合辑区分；派生「专辑」集合的复合 key，缺省回退 artist） */
    albumArtist: string;
    /** 时长毫秒（跨桥用 number，core 转秒） */
    durationMs: number;
    /** 文件字节数 */
    sizeBytes: number;
    /** 文件修改时间毫秒；与 sizeBytes 一起作增量指纹 */
    mtimeMs: number;
    /** 所属目录 canonical 路径；派生「文件夹」集合 */
    folderPath: string;
    /** 扩展名（小写无点，如 mp3） */
    extension: string;
    /** 是否含内嵌封面（仅标志，封面内容懒取） */
    hasCoverArt: boolean;
    /**
     * 自定义 tag `MF_MUSICITEM` 的首值（无则空串）：文件自带的脱敏版本化身份声明 JSON
     * 让媒体身份随文件自描述：扫到它就能把文件认成「来自某插件的某首歌」，
     * 而不是只按路径派生一个本地身份。只用于本地库身份，**不用于重建下载记录**
     */
    mfMusicItem: string;
}

/** 扫描入参 */
export interface ScanOptions {
    /** 扫描代次（JS 单调分配；所有事件原样回带，供 core 丢弃已取消旧扫描的迟到事件） */
    scanId: number;
    /** 扫描根目录（canonical、原生去重）；全盘=外部存储根 / 指定=用户选的目录 */
    roots: string[];
    /** 排除目录（按路径段边界匹配，避免 /Music 误命中 /MusicBackup） */
    excludedDirs: string[];
    /** 支持的扩展名白名单（小写无点） */
    extensions: string[];
    /** 最小时长秒（0=不限；读到 tag 后过滤） */
    minDurationSec: number;
    /** 最小文件大小字节（0=不限；枚举阶段即过滤，省读 tag） */
    minSizeBytes: number;
    /** 增量：已知 path→"mtimeMs:sizeBytes" 指纹的 JSON；指纹一致则跳过读 tag */
    knownFingerprintsJson: string;
    /** 每批经 onScanProgress 回传的条数 */
    batchSize: number;
    /**
     * 旧标签乱码的修复码表名（`'GBK'` / `'BIG5'`）；**空串 = 不修复**
     *
     * 一小部分老 MP3 的 ID3 标签写的是本地码页字节、编码字节却声明 ISO-8859-1，
     * TagLib 按声明解就成了「ÖÜ½ÜÂ×」。用哪张码表无法从字节判断（同一串按 Big5 解也
     * 「成功」、只是解出错字），故由 JS 按应用语言决定、原生只执行。
     * 原生侧还有一道形状判据，不是拿到码表就无条件转（见 Kotlin LegacyTagText）。
     * 注意 `'BIG5'` 目前实际覆盖很有限——形状判据要求双字节都 ≥0xA1，而 Big5 常用字的
     * trail 多在 0x40–0x7E：按字算 40.6% 修不了，而判据是整串一票否决，
     * **按标签算 2 字标题约 65%、3 字约 79% 修不了**
     */
    legacyTagCharset: string;
}

/**
 * 分批扫描进度：每批带新扫到/变化的文件 + 计数
 * 分批把 JS 对象物化成本摊开、不阻塞（New Arch JSI 无 JSON 序列化）
 */
export interface ScanProgressEvent {
    scanId: number;
    /** 本批新扫到或指纹变化的文件（已读 tag；标签无法解析的用文件名兜底、仍入库） */
    batch: ScannedAudioFile[];
    /** 已处理候选数（累计，含成功读标签 + 文件名兜底 + 瞬时失败） */
    processed: number;
    /** 枚举阶段确定的待处理总数 */
    total: number;
    /** 当前扫描位置短文本 */
    currentPath: string;
}

/**
 * 扫描完成：原生用传入指纹直接算差量、不回传全量路径（省跨桥/解析峰值）
 * core 据此删 removedPaths、保留 failedPaths（瞬时读失败沿用旧缓存、不误删）
 */
export interface ScanCompleteEvent {
    scanId: number;
    /** 确认不存在/超范围/被过滤的旧 path（core 从库删除） */
    removedPaths: string[];
    /** 读 tag 瞬时失败（IO 等）但文件仍在的 path（core 保留旧缓存、下次重试；标签无法解析的不在此列、已文件名兜底入 batch） */
    failedPaths: string[];
    /** 成功读取标签快照的文件数（不含兜底与失败） */
    tagsRead: number;
    /** 指纹一致、复用旧缓存未重读的数 */
    reused: number;
}

/** 扫描出错（整轮失败） */
export interface ScanErrorEvent {
    scanId: number;
    /** 错误码 'E_PERMISSION' | 'E_IO' | 'E_UNKNOWN' */
    code: string;
    message: string;
}

/**
 * 原生 TagLib 批量扫描器 TurboModule
 * 后台线程、两阶段（先枚举拿总数→逐个 TagLib 并发读 tag）、分批经事件回传
 */
export interface Spec extends TurboModule {
    /** 启动扫描；重复调按新 scanId、先取消上次 */
    startScan(options: ScanOptions): void;
    /** 取消指定代次（取消后不再发该 scanId 的完成/删除结算） */
    cancelScan(scanId: number): void;

    readonly onScanProgress: EventEmitter<ScanProgressEvent>;
    readonly onScanComplete: EventEmitter<ScanCompleteEvent>;
    readonly onScanError: EventEmitter<ScanErrorEvent>;
}

/* iOS 暂无实现：用 get（非 getEnforcing）使 import 不崩；桥层守卫、调用时才明确报 unsupported */
export default TurboModuleRegistry.get<Spec>('NativeMediaScanner');
