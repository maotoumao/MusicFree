package `fun`.upup.musicfree.sharedStorage

import android.Manifest
import android.content.ContentValues
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.system.Os
import android.system.OsConstants
import android.system.StructStat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import `fun`.upup.musicfree.specs.NativeSharedStorageSpec
import java.io.File
import java.io.IOException
import java.util.concurrent.Executors

/**
 * 共享存储桥：app 与系统文件域之间的互操作
 * 交付出去——Android 10 起走 MediaStore（免权限）；9 及以下直写公共目录，依赖已授予的存储权限
 * 定位进来——把系统交来的 URI 落到可读的真实路径
 * NativeSharedStorageSpec 由 codegen 生成，首次 build 后才存在
 */
@ReactModule(name = NativeSharedStorageModule.NAME)
class NativeSharedStorageModule(private val reactContext: ReactApplicationContext) :
    NativeSharedStorageSpec(reactContext) {

    // 备份文件可达数十 MB，TurboModule 方法在 JS 线程被调用，拷贝必须挪到后台
    private val executor = Executors.newSingleThreadExecutor()

    // 定位另起一路：provider 查询与开 fd 同样可能阻塞，且卡死的 provider 不该把后续请求一起堵住
    private val locatorExecutor = Executors.newCachedThreadPool()

    override fun invalidate() {
        executor.shutdown()
        locatorExecutor.shutdownNow()
        super.invalidate()
    }

    override fun saveToDownloads(
        sourcePath: String,
        fileName: String,
        mimeType: String,
        promise: Promise,
    ) {
        executor.execute {
            try {
                val source = File(sourcePath)
                if (!source.isFile) {
                    throw IOException("source file not found: $sourcePath")
                }
                val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    publishViaMediaStore(source, fileName, mimeType)
                } else {
                    publishToPublicDir(source, fileName)
                }
                promise.resolve(uri)
            } catch (e: SecurityException) {
                // 与 I/O 故障区分开，调用方据此引导授权而不是提示磁盘问题
                promise.reject(ERROR_PERMISSION, e.message, e)
            } catch (e: Exception) {
                promise.reject(ERROR_SAVE, e.message, e)
            }
        }
    }

    /** Android 10+：插入 MediaStore 再写入；IS_PENDING 置位期间只有本应用能打开 */
    private fun publishViaMediaStore(
        source: File,
        fileName: String,
        mimeType: String,
    ): String {
        val resolver = reactContext.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, fileName)
            put(MediaStore.Downloads.MIME_TYPE, mimeType)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val uri = resolver.insert(collection, values)
            ?: throw IOException("MediaStore refused to create $fileName")

        try {
            val output = resolver.openOutputStream(uri)
                ?: throw IOException("cannot open output stream for $fileName")
            output.use { sink -> source.inputStream().use { it.copyTo(sink) } }

            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            // 公开这步也必须在回滚范围内，否则条目会永远停在 pending 且无人清理
            if (resolver.update(uri, values, null, null) != 1) {
                throw IOException("failed to publish $fileName")
            }
        } catch (e: Exception) {
            // 半成品条目会以 0 字节留在下载列表里误导用户，失败即撤回
            resolver.delete(uri, null, null)
            throw e
        }
        return uri.toString()
    }

    /** Android 9 及以下：公共下载目录直写，需已授予存储权限 */
    private fun publishToPublicDir(source: File, fileName: String): String {
        val granted = ContextCompat.checkSelfPermission(
            reactContext,
            Manifest.permission.WRITE_EXTERNAL_STORAGE,
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            throw SecurityException("WRITE_EXTERNAL_STORAGE not granted")
        }

        val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if (!dir.isDirectory && !dir.mkdirs()) {
            throw IOException("cannot create ${dir.absolutePath}")
        }
        val target = reserveAvailableFile(dir, fileName)
        try {
            source.inputStream().use { input ->
                target.outputStream().use { input.copyTo(it) }
            }
        } catch (e: Exception) {
            // 残缺文件会留在用户的下载目录里冒充成功的备份
            target.delete()
            throw e
        }
        return Uri.fromFile(target).toString()
    }

    /**
     * 原子地占住一个未被使用的文件名
     * 用 createNewFile 而非先 exists 再写：两步之间被他人插入会导致覆盖用户已有文件
     * Android 10+ 由 MediaStore 自带该行为，无需此路径
     */
    private fun reserveAvailableFile(dir: File, fileName: String): File {
        val base = fileName.substringBeforeLast('.', fileName)
        val ext = fileName.substringAfterLast('.', "")
        val suffix = if (ext.isEmpty()) "" else ".$ext"
        var candidate = File(dir, fileName)
        var serial = 1
        while (!candidate.createNewFile()) {
            candidate = File(dir, "$base($serial)$suffix")
            serial += 1
        }
        return candidate
    }

    // —— 定位进来 ——

    override fun findReadableFilePath(fileLocation: String, promise: Promise) {
        locatorExecutor.execute {
            try {
                promise.resolve(locate(fileLocation))
            } catch (e: Exception) {
                promise.reject(ERROR_LOCATE, e.message, e)
            }
        }
    }

    private fun locate(fileLocation: String): String {
        // 先认裸路径：Uri.parse 会把路径里的第一个冒号当作 scheme 分隔符，绕开它才不会误判
        if (fileLocation.startsWith("/")) {
            return verifyPlainPath(fileLocation)
        }
        val uri = runCatching { Uri.parse(fileLocation) }.getOrNull() ?: return ""
        return when (uri.scheme?.lowercase()) {
            // getPath 已解码百分号转义
            "file" -> verifyPlainPath(uri.path ?: return "")
            "content" -> locateContent(uri)
            else -> ""
        }
    }

    /** 路径已知，只需确认确实是一个可读的普通文件 */
    private fun verifyPlainPath(path: String): String {
        val file = File(path)
        if (!file.isFile || !file.canRead()) {
            return ""
        }
        return runCatching { file.canonicalPath }.getOrDefault("")
    }

    /**
     * Android 没有官方的「content URI → 路径」API，故取多路候选再用内核事实校验：
     * 候选来源本身都不可靠（provider 可能乱报、docId 格式无契约），但只要校验确认候选与
     * 已打开的 fd 是同一文件，错误候选就只会被丢弃、不会返回错路径
     */
    private fun locateContent(uri: Uri): String {
        // 开 fd 既确认可读，又提供「同一文件」的判定基准；开不了说明无授权或无对应文件
        val pfd = runCatching {
            reactContext.contentResolver.openFileDescriptor(uri, "r")
        }.getOrNull() ?: return ""
        pfd.use { fd ->
            val truth = runCatching { Os.fstat(fd.fileDescriptor) }.getOrNull() ?: return ""
            // pipe / socket / memfd 等无路径可言（云盘、流式 provider 常见）
            if (!OsConstants.S_ISREG(truth.st_mode)) {
                return ""
            }
            for (candidate in candidatePaths(uri, fd)) {
                val verified = verifySameFile(candidate, truth)
                if (verified.isNotEmpty()) {
                    return verified
                }
            }
        }
        return ""
    }

    /** 惰性产出候选路径：命中即止，不做多余的 provider 查询 */
    private fun candidatePaths(uri: Uri, pfd: ParcelFileDescriptor): Sequence<String> = sequence {
        // 内核直给，与 provider 实现无关，命中率最高
        readLinkOf(pfd)?.let { yield(it) }
        // DATA 列 API 29 起不保证可用，但至今仍是 MediaStore 音频最直接的来源
        mediaStorePath(uri)?.let { yield(it) }
        // ExternalStorageProvider / DownloadsProvider 的 docId 拼路径
        documentPath(uri)?.let { yield(it) }
    }

    private fun readLinkOf(pfd: ParcelFileDescriptor): String? {
        val link = runCatching { Os.readlink("/proc/self/fd/${pfd.fd}") }.getOrNull() ?: return null
        // 非文件的 fd 形如 pipe:[1234]、anon_inode:...；文件已删除则带 " (deleted)" 后缀
        if (!link.startsWith("/") || link.endsWith(" (deleted)")) {
            return null
        }
        return link
    }

    private fun mediaStorePath(uri: Uri): String? {
        // getMediaUri 能把 ExternalStorage / MediaDocuments 的 URI 归一到 MediaStore
        val mediaUri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            runCatching { MediaStore.getMediaUri(reactContext, uri) }.getOrNull()
        } else {
            null
        }
        return mediaUri?.let { queryDataColumn(it) } ?: queryDataColumn(uri)
    }

    private fun queryDataColumn(uri: Uri): String? = runCatching {
        reactContext.contentResolver.query(
            uri, arrayOf(MediaStore.MediaColumns.DATA), null, null, null,
        )?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
    }.getOrNull()?.takeIf { it.isNotEmpty() }

    /**
     * 按 authority 解析 AOSP 两个已知 provider 的 docId；其余 provider 的格式无契约，不猜
     * 拼出的只是候选，最终由 verifySameFile 定夺
     */
    private fun documentPath(uri: Uri): String? {
        if (!DocumentsContract.isDocumentUri(reactContext, uri)) {
            return null
        }
        val docId = runCatching { DocumentsContract.getDocumentId(uri) }.getOrNull() ?: return null
        return when (uri.authority) {
            AUTHORITY_DOWNLOADS -> docId.removePrefix("raw:").takeIf { it != docId }
            AUTHORITY_EXTERNAL_STORAGE -> externalStoragePath(docId)
            else -> null
        }
    }

    /** ExternalStorageProvider 的 docId 形如 primary:Music/a.mp3 */
    private fun externalStoragePath(docId: String): String? {
        val parts = docId.split(':', limit = 2)
        if (parts.size != 2 || parts[1].isEmpty()) {
            return null
        }
        val (volume, relative) = parts
        val root = if (volume.equals("primary", ignoreCase = true)) {
            Environment.getExternalStorageDirectory().path
        } else {
            "/storage/$volume"
        }
        val candidate = File(root, relative)
        // relative 可能含 ..，规范化后必须仍在卷内，避免被 provider 驱动去探测任意路径
        val canonical = runCatching { candidate.canonicalPath }.getOrNull() ?: return null
        val rootCanonical = runCatching { File(root).canonicalPath }.getOrNull() ?: return null
        return canonical.takeIf { it.startsWith("$rootCanonical/") }
    }

    /**
     * 确认候选路径与已打开的 fd 确为同一文件
     * 只认 (dev, ino)：候选来源都不可信，而 (size, mtime) 相同的不同文件很常见
     * （复制、重复下载、恢复备份都会产生），拿它当证据会把 URI 映射到别的文件、
     * 进而算出错误的媒体身份。宁可定位失败降级，也不返回错路径
     */
    private fun verifySameFile(path: String, truth: StructStat): String {
        val file = File(path)
        if (!file.isFile || !file.canRead()) {
            return ""
        }
        val canonical = runCatching { file.canonicalPath }.getOrNull() ?: return ""
        val stat = runCatching { Os.stat(canonical) }.getOrNull() ?: return ""
        val sameFile = stat.st_dev == truth.st_dev && stat.st_ino == truth.st_ino
        return if (sameFile) canonical else ""
    }

    companion object {
        const val NAME = "NativeSharedStorage"
        private const val ERROR_SAVE = "E_SAVE_TO_DOWNLOADS"
        private const val ERROR_PERMISSION = "E_STORAGE_PERMISSION"
        private const val ERROR_LOCATE = "E_LOCATE_FILE"
        private const val AUTHORITY_DOWNLOADS = "com.android.providers.downloads.documents"
        private const val AUTHORITY_EXTERNAL_STORAGE = "com.android.externalstorage.documents"
    }
}
