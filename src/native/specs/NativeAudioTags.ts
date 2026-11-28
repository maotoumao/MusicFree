import { TurboModuleRegistry, type TurboModule } from 'react-native';

/**
 * 音频 tag 读写桥：薄适配原生 AudioTagStore（RN-free 引擎）
 * fileLocation 为裸串：绝对路径 / file:// / content://，原生按 scheme 自判
 * 预期错误走带内（结果的 status 字段），由 core 统一分类；status 语义见 AudioTagStore.TagStatus
 * 仅未预期的桥故障（marshalling / 原生异常）才 reject，core 需把 reject 视作不可重试错误
 * 跨桥字段用 string 承 union（codegen 对字面量 union 支持受限）
 */

/** 读到的 tag 快照 */
export interface AudioTagSnapshot {
    /** 0=OK；其余为错误码（native + store 级） */
    status: number;
    /** 大写 key、Unicode 多值 */
    fields: { [key: string]: string[] };
    durationMs: number;
    bitrateKbps: number;
    sampleRateHz: number;
    channels: number;
    hasCoverArt: boolean;
}

/** 封面编辑命令：op = 'unchanged' | 'remove' | 'replace'（replace 时 imagePath 必填，字节只在原生侧流转） */
export interface AudioTagCoverEdit {
    op: string;
    imagePath?: string;
}

/** 写入补丁：未传的键不动 */
export interface AudioTagPatch {
    setFields: { [key: string]: string[] };
    removeFields: string[];
    cover: AudioTagCoverEdit;
}

/** 提取封面结果：无封面时 path 为空串且 status=0 */
export interface CoverExtractResult {
    status: number;
    path: string;
    mime: string;
    byteCount: number;
}

export interface Spec extends TurboModule {
    /** 读 tag 与技术属性 */
    readTags(fileLocation: string): Promise<AudioTagSnapshot>;
    /** 批量读（原生池并行 fan-out）；逐项独立结果 */
    readTagsBatch(fileLocations: string[]): Promise<AudioTagSnapshot[]>;
    /** 写 tag 与封面；resolve 为写后回读快照 */
    writeTags(
        fileLocation: string,
        patch: AudioTagPatch,
    ): Promise<AudioTagSnapshot>;
    /** 提取主封面到 destPath（Front Cover 优先，否则第一张） */
    extractPrimaryCover(
        fileLocation: string,
        destPath: string,
    ): Promise<CoverExtractResult>;
}

/* iOS 暂无实现（NativeAudioTags.mm 未进 Xcode target）：用 get（非 getEnforcing）使 import 不崩；调用经 infra/audioTags 的 required() 守卫报 unsupported */
export default TurboModuleRegistry.get<Spec>('NativeAudioTags');
