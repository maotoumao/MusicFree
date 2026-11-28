import { TurboModuleRegistry, type TurboModule } from 'react-native';

/**
 * 共享存储桥：app 与系统文件域之间的互操作——把私有文件交付出去，或把系统交来的 URI 落到可读路径
 * 划界：只放 scoped storage 下必须绕行 MediaStore / DocumentsProvider 的进出动作；
 * app 私有目录的读写归 rn-fs，不进此桥
 */
export interface Spec extends TurboModule {
    /**
     * 把 sourcePath 的文件另存到系统「下载」目录，返回其在系统中的 URI
     * 同名时自动改名而非覆盖用户已有文件
     * Android 10+ 走 MediaStore，免权限，且写入期间对其他应用不可见；
     * Android 9 及以下直写公共目录，需已授予存储权限，未授予时以 E_STORAGE_PERMISSION 失败
     * iOS 落到 app 文档目录，当前对用户不可见（见 .mm 中待定的可见性决策）
     */
    saveToDownloads(
        sourcePath: string,
        fileName: string,
        mimeType: string,
    ): Promise<string>;

    /**
     * 找出 fileLocation 背后可直接读取的 canonical 绝对路径；找不到返回空串
     * 接受 content:// / file:// / 裸绝对路径
     * 系统「打开方式」交付的文件几乎都是 content://（API 24 起 file:// 跨应用传递会触发
     * FileUriExposedException），而本地音乐身份取自 canonical 路径，落到真实路径才能与已扫描条目对上
     * Android 无官方的 content URI → 路径 API，故取多路候选再经内核事实校验确认确为同一文件；
     * 定位不到是预期结果（云盘等 provider 本就无对应文件），由调用方决定降级
     * iOS 无 content URI，仅需从 file:// 还原路径并校验可读
     */
    findReadableFilePath(fileLocation: string): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeSharedStorage');
